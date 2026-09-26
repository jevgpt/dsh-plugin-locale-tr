/**
 * Translation quality gates that catch the failure modes a review misses:
 * broken `{placeholder}` tokens, leftover Chinese, and copy that was never
 * actually translated.
 *
 * A placeholder is substituted at runtime, so a renamed or dropped token
 * silently corrupts the rendered string. Chinese characters mean a value was
 * copied from the wrong source column.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DICTS = join(ROOT, 'src', 'dictionaries');

const dictionaries = readdirSync(DICTS)
  .filter((name) => name.endsWith('.json'))
  .map((file) => ({ file, ...JSON.parse(readFileSync(join(DICTS, file), 'utf8')) }));

/** `{name}` tokens in a string, sorted so order does not matter. */
const placeholders = (text) => (text.match(/\{[^{}]*\}/g) ?? []).sort();

/** CJK ranges plus fullwidth forms, which never belong in Turkish copy. */
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

test('Turkish values preserve every placeholder of their English source', () => {
  const broken = [];
  for (const record of dictionaries) {
    for (const [key, value] of Object.entries(record.tr ?? {})) {
      const english = record.rows[key]?.en;
      if (typeof english !== 'string') continue;
      const want = placeholders(english).join('|');
      const got = placeholders(value).join('|');
      if (want !== got) broken.push(`${record.ns}.${key}: en=${JSON.stringify(english)} tr=${JSON.stringify(value)}`);
    }
  }
  assert.deepEqual(broken, [], `placeholder mismatches:\n${broken.join('\n')}`);
});

test('no Turkish value contains Chinese characters', () => {
  const leaked = [];
  for (const record of dictionaries) {
    for (const [key, value] of Object.entries(record.tr ?? {})) {
      if (CJK.test(value)) leaked.push(`${record.ns}.${key}: ${JSON.stringify(value)}`);
    }
  }
  assert.deepEqual(leaked, [], `Chinese characters in Turkish copy:\n${leaked.join('\n')}`);
});

test('no Turkish value is still byte-identical to its English source unless it is non-linguistic', () => {
  // A value may legitimately stay identical, and each reason is spelled out so
  // genuinely untranslated prose cannot hide among the exceptions.
  /** Unit and technology tokens that stay as written in a format template. */
  const TEMPLATE_WORDS = new Set([
    'ms', 'px', 'tok', 's', 'K', 'M', 'V', 'Cron', 'Terminal', 'Plan', 'Markdown',
    'Bash', 'Glob', 'Grep', 'Pwsh', 'Finder', 'Model', 'Platform', 'Client', 'Host',
    'JSON', 'HTTP', 'TTFT',
  ]);
  /** Identifiers, command tokens, and words Turkish convention leaves as-is. */
  const IDENTIFIERS = new Set([
    'compact', 'export', 'feedback', 'goal', 'permission', 'plan', 'Tab', 'userData',
    'keybindings.json',
  ]);
  const TECHNICAL = /^[^\s]+\.(json|md|yml|yaml|ts|js|css)$/;
  const SHARED_PROSE = new Set(['Plan · Markdown']);

  /** True when the value is punctuation and placeholders only. */
  const hasNoProse = (value) => /^[\s\W_]*$/.test(value.replace(/\{[^{}]*\}/g, ''));

  /** True when every word-like run outside the placeholders is a known unit. */
  const isTemplate = (value) => {
    const literal = value.replace(/\{[^{}]*\}/g, ' ');
    const words = literal.match(/[A-Za-z]+/g) ?? [];
    return words.length > 0 && words.every((word) => TEMPLATE_WORDS.has(word));
  };

  const isAllowed = (value) =>
    hasNoProse(value) || isTemplate(value) || TECHNICAL.test(value) || IDENTIFIERS.has(value) || SHARED_PROSE.has(value);

  const identical = [];
  for (const record of dictionaries) {
    for (const [key, value] of Object.entries(record.tr ?? {})) {
      const english = record.rows[key]?.en;
      if (typeof english !== 'string' || english.trim() === '') continue;
      if (value.trim() !== english.trim()) continue;
      if (isAllowed(value.trim())) continue;
      identical.push(`${record.ns}.${key}: ${JSON.stringify(value)}`);
    }
  }
  assert.deepEqual(identical, [], `untranslated English copy:\n${identical.join('\n')}`);
});
