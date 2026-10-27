import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));

test('exported source bytes match their provenance manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'source-manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(Object.keys(manifest.exportedFiles).sort(), Object.keys(manifest.files).sort());
  for (const [name, expected] of Object.entries(manifest.exportedFiles)) {
    assert.ok(!path.isAbsolute(name) && !name.split('/').includes('..'), name);
    const actual = createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
    assert.equal(actual, expected, name);
    if (actual !== manifest.files[name]) assert.ok(manifest.localModifications[name], name);
  }
});

test('local documentation links resolve to files in the repository', () => {
  const files = ['README.md', 'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md',
    ...fs.readdirSync(path.join(root, 'docs')).filter(name => name.endsWith('.md')).map(name => 'docs/' + name)];
  for (const name of files) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    for (const match of text.matchAll(/\]\(([^\s)]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|#)/.test(target)) continue;
      const resolved = path.resolve(root, path.dirname(name), decodeURIComponent(target.split('#')[0]));
      const relative = path.relative(root, resolved);
      assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), name + ': ' + target);
      assert.ok(fs.statSync(resolved).isFile(), name + ': ' + target);
    }
  }
});
