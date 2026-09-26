#!/usr/bin/env node
/**
 * Offline verification of the generated bundle.
 *
 * Loads `lib/client.js` in a sandbox that mimics the dsh client module loader,
 * then drives the exported `apply` against a locale-service stand-in and
 * asserts that the language and every dictionary register as declared.
 *
 * This proves the artifact is well-formed without a browser or a running app.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'lib', 'client.js');
const DICTS = join(ROOT, 'src', 'dictionaries');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

if (!existsSync(BUNDLE)) {
  console.error(`missing ${BUNDLE}; run \`npm run build\` first`);
  process.exit(1);
}

/* ---- load the bundle the way the client module loader does ---- */
let registration = null;
const sandbox = { window: { __ModuleLoader__: { load: (value) => { registration = value; } } } };
vm.createContext(sandbox);
vm.runInContext(readFileSync(BUNDLE, 'utf8'), sandbox, { filename: 'lib/client.js' });

check('bundle registers a module on window.__ModuleLoader__', registration !== null);
if (registration === null) process.exit(1);
check('module id matches package name', registration.id === pkg.name, `${registration.id} vs ${pkg.name}`);
check('factory is a function', typeof registration.factory === 'function');

const exports_ = registration.factory((specifier) => {
  throw new Error(`bundle requested unexpected external "${specifier}"`);
});
check('exports apply()', typeof exports_.apply === 'function');
check('exports inject listing the locale service', Array.isArray(exports_.inject) && exports_.inject.includes('locale'), JSON.stringify(exports_.inject));

/* ---- drive apply() against a locale-service stand-in ---- */
const languages = [];
const dicts = new Map();
const effectLabels = [];
const ctx = {
  effect(effect, label) {
    effectLabels.push(label);
    return effect();
  },
  locale: {
    addLanguage(definition) {
      if (definition.fallback !== 'en') throw new Error(`unregistered fallback ${definition.fallback}`);
      languages.push({ ...definition });
    },
    register(ns, locale, dict) {
      const key = `${ns}\u0000${locale}`;
      if (dicts.has(key)) throw new Error(`duplicate registration for ${ns}/${locale}`);
      dicts.set(key, dict);
    },
  },
};

exports_.apply(ctx);

check('registers exactly one language', languages.length === 1, JSON.stringify(languages));
check('language is Turkish with an English fallback', languages[0]?.id === 'tr' && languages[0]?.label === 'Türkçe' && languages[0]?.fallback === 'en', JSON.stringify(languages[0]));

const source = readdirSync(DICTS).filter((file) => file.endsWith('.json'));
const expected = new Map();
for (const file of source) {
  const record = JSON.parse(readFileSync(join(DICTS, file), 'utf8'));
  const translated = Object.keys(record.tr ?? {}).filter((key) => typeof record.tr[key] === 'string' && record.tr[key].trim() !== '');
  expected.set(record.ns, { keys: new Set(translated), total: Object.keys(record.rows ?? {}).length });
}

const registeredNamespaces = new Set([...dicts.keys()].map((key) => key.split('\u0000')[0]));
const missingNamespaces = [...expected.keys()].filter((ns) => !registeredNamespaces.has(ns));
const extraNamespaces = [...registeredNamespaces].filter((ns) => !expected.has(ns));
check('every namespace in src/dictionaries is registered', missingNamespaces.length === 0, missingNamespaces.join(', '));
check('no namespace is registered that src/dictionaries does not declare', extraNamespaces.length === 0, extraNamespaces.join(', '));

let keyMismatches = 0;
let registeredKeys = 0;
const keyDetail = [];
for (const [ns, want] of expected) {
  const dict = dicts.get(`${ns}\u0000tr`);
  if (dict === undefined) { keyMismatches += 1; continue; }
  const got = new Set(Object.keys(dict));
  registeredKeys += got.size;
  const missing = [...want.keys].filter((key) => !got.has(key));
  const extra = [...got].filter((key) => !want.keys.has(key));
  if (missing.length || extra.length) {
    keyMismatches += 1;
    keyDetail.push(`${ns}: -${missing.length} +${extra.length}`);
  }
}
check('every translated key is registered with the right key set', keyMismatches === 0, keyDetail.join('; '));

const expectedKeys = [...expected.values()].reduce((sum, entry) => sum + entry.keys.size, 0);
check('registered key count matches src/dictionaries', registeredKeys === expectedKeys, `${registeredKeys} vs ${expectedKeys}`);

check('one effect per contribution', effectLabels.length === registeredNamespaces.size + 1, `${effectLabels.length} effects for ${registeredNamespaces.size} namespaces`);

console.log(`\nnamespaces: ${registeredNamespaces.size}  keys: ${registeredKeys}`);
const coverage = [...expected.values()].reduce((sum, entry) => sum + entry.keys.size, 0) /
  [...expected.values()].reduce((sum, entry) => sum + entry.total, 0);
console.log(`coverage: ${(coverage * 100).toFixed(1)}% of the UI strings this build ships`);
console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`}`);
process.exitCode = failures.length === 0 ? 0 : 1;
