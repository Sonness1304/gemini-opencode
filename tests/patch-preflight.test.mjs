import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const recipe = fileURLToPath(new URL('../tooling/gemini-session-go/patch.mjs', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(new URL('../tooling/gemini-session-go/source-hashes.json', import.meta.url)));

test('patch refuses a different source tree before modifying files', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-patch-tree-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.writeFileSync(path.join(dir, 'sentinel.txt'), 'keep original');
  const result = spawnSync(process.execPath, [recipe, dir], {encoding: 'utf8', timeout: 15000});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /source tree differs from pinned archive/);
  assert.deepEqual(fs.readdirSync(dir), ['sentinel.txt']);
  assert.equal(fs.readFileSync(path.join(dir, 'sentinel.txt'), 'utf8'), 'keep original');
});

test('patch refuses changed bytes even with the exact upstream file list', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-patch-hash-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  for (const name of Object.keys(manifest)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), {recursive: true});
    fs.writeFileSync(path.join(dir, name), 'synthetic unchanged sentinel');
  }
  const result = spawnSync(process.execPath, [recipe, dir], {encoding: 'utf8', timeout: 15000});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /source hash mismatch/);
  for (const name of Object.keys(manifest)) {
    assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), 'synthetic unchanged sentinel');
  }
});
