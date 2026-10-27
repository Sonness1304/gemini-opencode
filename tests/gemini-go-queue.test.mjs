import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createGoQueue } from '../scripts/gemini-go-queue.mjs';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
function fixture(t, options = {}) {
  const queue = createGoQueue({ key: 'synthetic-key', concurrency: 2, queueTimeoutMs: 300, requestTimeoutMs: 1500,
    retryDelayMs: 5, maxBodyBytes: 64, ...options });
  t.after(() => { queue.closeAllConnections(); queue.close(); }); return queue;
}
const post = (url, body = '{}', key = 'synthetic-key', signal) => fetch(url + '/v1/chat/completions', {
  method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body, signal,
});

test('burst queues requests and keeps upstream concurrency bounded', async t => {
  let active = 0, max = 0, calls = 0;
  const queue = fixture(t, { fetchImpl: async () => {
    calls++; max = Math.max(max, ++active); await new Promise(r => setTimeout(r, 20)); active--;
    return new Response('data: OK\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  } });
  const url = await listen(queue);
  const responses = await Promise.all(Array.from({ length: 7 }, () => post(url).then(async r => [r.status, await r.text()])));
  assert.equal(calls, 7); assert.equal(max, 2); assert.ok(responses.every(([s, body]) => s === 200 && body.includes('[DONE]')));
});

test('only explicit local concurrent refusal is retried; quota/errors are preserved', async t => {
  let calls = 0;
  const queue = fixture(t, { fetchImpl: async () => ++calls === 1
    ? Response.json({ error: { code: 'ip_slot_full', message: 'direct IP slot full: concurrent limit reached' } }, { status: 429 })
    : new Response('ok') });
  const url = await listen(queue); assert.equal((await post(url)).status, 200); assert.equal(calls, 2);
  calls = 0;
  const quota = fixture(t, { fetchImpl: async () => { calls++; return Response.json({ error: { code: 'ip_slot_full', message: 'hourly limit reached' } }, { status: 429 }); } });
  const quotaUrl = await listen(quota); const r = await post(quotaUrl); assert.equal(r.status, 429); assert.equal(calls, 1);
});

test('context budget errors reach the client once without retry or rewriting',async t=>{
 let calls=0;
 const payload={error:{code:'context_length_exceeded',type:'invalid_request_error',message:'Use a shorter checkpoint.'}};
 const queue=fixture(t,{fetchImpl:async()=>{calls++;return Response.json(payload,{status:400})}});
 const url=await listen(queue);const response=await post(url);
 assert.equal(response.status,400);assert.deepEqual(await response.json(),payload);assert.equal(calls,1);
});

test('auth, routes, oversized body and queue deadline fail before inference', async t => {
  let calls = 0;
  const queue = fixture(t, { concurrency: 1, maxQueued: 1, queueTimeoutMs: 50,
    fetchImpl: async () => { calls++; await new Promise(r => setTimeout(r, 180)); return new Response('ok'); } });
  const url = await listen(queue);
  assert.equal((await post(url, '{}', 'wrong')).status, 401);
  assert.equal((await fetch(url + '/admin/api/cookies')).status, 404);
  assert.equal((await post(url, 'a'.repeat(65))).status, 413); assert.equal(calls, 0);
  const first = post(url); await new Promise(r => setTimeout(r, 15));
  const second = post(url); await new Promise(r => setTimeout(r, 10));
  assert.equal((await post(url)).status, 503);
  const expired = await second; assert.equal(expired.status, 503); assert.equal((await expired.json()).error.code, 'queue_timeout');
  assert.equal((await first).status, 200); assert.equal(calls, 1);
});

test('client cancellation removes queued work and releases its slot', async t => {
  let calls = 0;
  const queue = fixture(t, { concurrency: 1, fetchImpl: async () => { calls++; await new Promise(r => setTimeout(r, 80)); return new Response('ok'); } });
  const url = await listen(queue); const first = post(url); await new Promise(r => setTimeout(r, 15));
  const controller = new AbortController(); const cancelled = post(url, '{}', 'synthetic-key', controller.signal);
  await new Promise(r => setTimeout(r, 15)); controller.abort(); await assert.rejects(cancelled);
  await first; await new Promise(r => setTimeout(r, 20)); assert.equal(calls, 1);
  assert.equal((await post(url)).status, 200); assert.equal(calls, 2);
});

test('an unfinished upload releases its active slot at the request deadline', async t => {
  let calls = 0;
  const queue = fixture(t, { concurrency: 1, requestTimeoutMs: 25,
    fetchImpl: async () => { calls++; return new Response('ok'); } });
  const url = await listen(queue);
  const stalled = http.request(url + '/v1/chat/completions', { method: 'POST',
    headers: { Authorization: 'Bearer synthetic-key', 'Content-Length': '20' } });
  stalled.on('error', () => {}); stalled.write('{'); t.after(() => stalled.destroy());
  await new Promise(r => setTimeout(r, 90));
  const health = await (await fetch(url + '/health')).json();
  assert.equal(health.active, 0); assert.equal(calls, 0);
  assert.equal((await post(url)).status, 200); assert.equal(calls, 1);
});
