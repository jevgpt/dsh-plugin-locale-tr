/**
 * Integrity of the shipped dictionaries.
 *
 * Every file is one namespace: `rows` carries the English and Chinese source
 * text a dsh build ships, `tr` carries this pack's Turkish. The English row is
 * the translation brief, so a key without one cannot be reviewed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DICTS = join(ROOT, 'src', 'dictionaries');
const files = readdirSync(DICTS).filter((name) => name.endsWith('.json'));

/** Parse every dictionary once for the whole suite. */
const dictionaries = files.map((file) => {
  const record = JSON.parse(readFileSync(join(DICTS, file), 'utf8'));
  return { file, ...record };
});

test('the pack ships dictionaries', () => {
  assert.ok(dictionaries.length > 0, 'expected at least one namespace');
});

test('every dictionary declares a namespace and source rows', () => {
  for (const record of dictionaries) {
    assert.equal(typeof record.ns, 'string', `${record.file}: ns`);
    assert.ok(record.ns.length > 0, `${record.file}: ns must not be empty`);
    assert.ok(/^[A-Za-z][\w.-]*$/.test(record.ns), `${record.file}: ns "${record.ns}" is not a valid namespace`);
    assert.equal(typeof record.rows, 'object', `${record.file}: rows`);
    assert.ok(record.rows !== null && !Array.isArray(record.rows), `${record.file}: rows must be an object`);
    assert.ok(Object.keys(record.rows).length > 0, `${record.file}: rows must not be empty`);
  }
});

test('namespace names are unique across files', () => {
  const seen = new Map();
  for (const record of dictionaries) {
    assert.equal(seen.get(record.ns), undefined, `namespace "${record.ns}" is declared by both ${seen.get(record.ns)} and ${record.file}`);
    seen.set(record.ns, record.file);
  }
});

test('every source key carries English text where the build provides one', () => {
  // `null` means the English dictionary has no such key; an empty string is a
  // real shipped value (chat.message.stepProcess.sharedPrefix is a clear-prefix
  // marker), so only the absence of a value is a defect.
  for (const record of dictionaries) {
    for (const [key, row] of Object.entries(record.rows)) {
      if (row.en === null) continue;
      assert.equal(typeof row.en, 'string', `${record.ns}.${key}: English source must be a string or null`);
    }
  }
});

test('every Turkish value is a non-empty string for a known key', () => {
  for (const record of dictionaries) {
    for (const [key, value] of Object.entries(record.tr ?? {})) {
      assert.ok(key in record.rows, `${record.ns}.${key}: translated key has no source row`);
      assert.equal(typeof value, 'string', `${record.ns}.${key}: value must be a string`);
      assert.ok(value.trim().length > 0, `${record.ns}.${key}: value is empty`);
    }
  }
});
