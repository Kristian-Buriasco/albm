import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';

// The API reference page loads this file; a YAML error there shows "Document could not be loaded".
for (const f of ['docs/openapi.yaml', 'public/openapi.yaml']) {
  test(`${f} parses and has paths`, () => {
    const doc = parse(fs.readFileSync(f, 'utf8'));
    assert.ok(Object.keys(doc.paths).length > 0);
  });
}

test('public/openapi.yaml matches docs/openapi.yaml', () => {
  assert.equal(fs.readFileSync('public/openapi.yaml', 'utf8'), fs.readFileSync('docs/openapi.yaml', 'utf8'));
});
