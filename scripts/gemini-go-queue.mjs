import http from 'node:http';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const fault = (code, status = 503) => Object.assign(new Error(code), { code, status });
const delay = (ms, signal) => new Promise((resolve, reject) => {
  const stop = () => { clearTimeout(timer); reject(fault('client_cancelled', 499)); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, ms);
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) stop();
});

export function createGoQueue({ key, concurrency = 8, maxQueued = 32, queueTimeoutMs = 120000,
  requestTimeoutMs = 240000, retryDelayMs = 1000, maxBodyBytes = 20 * 1024 * 1024,
  fetchImpl = fetch } = {}) {
  if (!key || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw Error('Invalid queue configuration');
  const digest = value => crypto.createHash('sha256').update(value).digest();
  const expected = digest(key);
  let active = 0;
  const waiting = [];
  function acquire(signal) {
    if (signal.aborted) return Promise.reject(fault('client_cancelled', 499));
    if (active < concurrency) { active++; return Promise.resolve(); }
    if (waiting.length >= maxQueued) return Promise.reject(fault('queue_full'));
    return new Promise((resolve, reject) => {
      const item = { grant: () => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(); } };
      const remove = error => { const index = waiting.indexOf(item); if (index < 0) return;
        waiting.splice(index, 1); clearTimeout(timer); signal.removeEventListener('abort', abort); reject(error); };
      const abort = () => remove(fault('client_cancelled', 499));
      const timer = setTimeout(() => remove(fault('queue_timeout')), queueTimeoutMs);
      waiting.push(item); signal.addEventListener('abort', abort, { once: true });
    });
  }
  function release() { const next = waiting.shift(); if (next) next.grant(); else active--; }
  function json(res, status, code) {
    if (res.destroyed || res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: { code, message: code, type: 'local_queue_error' } }));
  }
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ service: 'jarvis-gemini-go-queue', version: 1, concurrency, active, queued: waiting.length })); return;
    }
    const route = req.url?.split('?')[0];
    const allowed = (req.method === 'POST' && ['/v1/chat/completions', '/v1/responses', '/v1/videos'].includes(route)) ||
      (req.method === 'GET' && (route === '/v1/models' || /^\/v1\/videos\/[a-zA-Z0-9_-]+(?:\/content)?$/.test(route)));
    if (!allowed) { json(res, 404, 'route_not_found'); return; }
    const auth = req.headers.authorization?.replace(/^Bearer /, '') ?? req.headers['x-api-key'] ?? '';
    if (typeof auth !== 'string' || !crypto.timingSafeEqual(digest(auth), expected)) { json(res, 401, 'invalid_api_key'); return; }
    if (Number(req.headers['content-length']) > maxBodyBytes) { json(res, 413, 'body_too_large'); return; }
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', cancel); req.on('aborted', cancel);
    let held = false, timer;
    try {
      await acquire(controller.signal); held = true;
      if (controller.signal.aborted) throw fault('client_cancelled', 499);
      timer = setTimeout(() => {
        controller.abort();
        // AbortController alone cannot interrupt an IncomingMessage body iterator.
        if (!req.complete) req.destroy();
      }, requestTimeoutMs);
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > maxBodyBytes) throw fault('body_too_large', 413); chunks.push(chunk); }
      const body = req.method === 'POST' ? Buffer.concat(chunks) : undefined;
      const deadline = Date.now() + queueTimeoutMs;
      for (;;) {
        const upstream = await fetchImpl('http://127.0.0.1:20831' + req.url, {
          method: req.method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body, redirect: 'manual', signal: controller.signal,
        });
        if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); throw fault('upstream_redirect_refused', 502); }
        if (upstream.status === 429 || upstream.status === 502) {
          const parts = []; let bytes = 0;
          if (upstream.body) for await (const part of upstream.body) {
            bytes += part.length; if (bytes > 16384) throw fault('upstream_error_too_large', 502); parts.push(part);
          }
          const errorBody = Buffer.concat(parts); let error;
          try { error = JSON.parse(errorBody.toString()).error; } catch { /* Preserve non-JSON refusal. */ }
          // Retry only Go's explicit rejection before generation, never quota or unknown outcomes.
          if (error?.code === 'ip_slot_full' && /concurrent limit reached/.test(error.message ?? '')) {
            if (Date.now() >= deadline) throw fault('queue_timeout');
            await delay(retryDelayMs, controller.signal); continue;
          }
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' }); res.end(errorBody); break;
        }
        res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
          'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
        if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res); else res.end();
        break;
      }
    } catch (error) {
      if (!res.headersSent) json(res, error.status ?? (controller.signal.aborted ? 504 : 502), error.code ?? 'upstream_request_failed');
      else res.destroy();
    } finally {
      clearTimeout(timer); res.off('close', cancel); req.off('aborted', cancel); if (held) release();
    }
  });
  server.headersTimeout = 15000;
  server.requestTimeout = queueTimeoutMs + requestTimeoutMs + 15000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const response = await fetch('http://127.0.0.1:20831/admin/api/apikey', { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) throw Error('Go key unavailable');
    const { key } = await response.json();
    const server = createGoQueue({ key });
    server.on('error', () => { console.error('Gemini queue failed to listen'); process.exitCode = 1; });
    server.listen(20832, '127.0.0.1');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
  } catch { console.error('Start Gemini Go before starting its queue'); process.exitCode = 1; }
}
