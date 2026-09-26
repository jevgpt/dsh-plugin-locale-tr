/**
 * Integration check against a real dsh installation.
 *
 * This is the closest thing to "does Turkish actually render?" that runs
 * without a browser. It takes the dictionaries out of the app's own client
 * bundles with the shipped extractor, loads `lib/client.js` the way the client
 * module loader does, and then runs the locale service's own lookup algorithm —
 * copied verbatim from `@deepseek-ai/dsh-client-locale/lib/client.js` — over the
 * resulting state.
 *
 * It needs a full extraction of the app's packages, because the desktop install
 * keeps most of them inside `app.asar`:
 *
 *   npx --yes @electron/asar extract "<resources>/app.asar" .dsh-extract
 *   DSH_EXTRACT=.dsh-extract npm run test:e2e
 *
 * Without `DSH_EXTRACT` (or with a path that does not resolve) the check skips
 * with a reason, so a clean checkout stays green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Resolve the `@deepseek-ai` packages directory from DSH_EXTRACT, or undefined. */
function resolvePackages() {
  const given = process.env.DSH_EXTRACT;
  if (given === undefined || given === '') return undefined;
  const base = resolve(ROOT, given);
  const candidates = [base, join(base, 'dsh', 'node_modules', '@deepseek-ai'), join(base, 'node_modules', '@deepseek-ai')];
  return candidates.find((dir) => existsSync(join(dir, 'dsh-client-locale')));
}

const PACKAGES = resolvePackages();
const SKIP = PACKAGES === undefined
  ? 'set DSH_EXTRACT to an extracted app.asar to run the integration check'
  : false;

/** Load the dictionaries, the pack bundle, and the service algorithm once. */
function buildState() {
  const { readClientBundles, extractPackageNamespaces } = registry;
  const localeBundle = join(PACKAGES, 'dsh-client-locale/lib/client.js');

  const dicts = new Map();
  for (const [, src] of readClientBundles(PACKAGES)) {
    for (const [ns, pair] of extractPackageNamespaces(src)) {
      if (!dicts.has(ns)) dicts.set(ns, new Map());
      const byLocale = dicts.get(ns);
      for (const locale of ['zh', 'en']) {
        const values = pair[locale];
        if (values === undefined || Object.keys(values).length === 0) continue;
        byLocale.set(locale, { ...(byLocale.get(locale) ?? {}), ...values });
      }
    }
  }

  let registration = null;
  const sandbox = { window: { __ModuleLoader__: { load: (value) => { registration = value; } } } };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(ROOT, 'lib/client.js'), 'utf8'), sandbox, { filename: 'lib/client.js' });

  const languages = [{ id: 'zh', label: '中文', fallback: 'en' }, { id: 'en', label: 'English' }];
  const packNamespaces = new Set();
  const exports_ = registration.factory((specifier) => {
    throw new Error(`unexpected external ${specifier}`);
  });
  exports_.apply({
    effect(effect) { return effect(); },
    locale: {
      addLanguage(definition) { languages.push({ ...definition }); },
      register(ns, locale, dict) {
        packNamespaces.add(ns);
        if (!dicts.has(ns)) dicts.set(ns, new Map());
        dicts.get(ns).set(locale, dict);
      },
    },
  });

  // The shipped `fallbackChain`, `lookup` and `translate` bodies. The class
  // method reads `this.catalog` and memoises in `this.fallbackChains`; only the
  // memo is dropped, since a handful of lookups need no cache.
  const src = readFileSync(localeBundle, 'utf8');
  const at = src.indexOf('fallbackChain(start) {');
  const traversal = src
    .slice(at + 'fallbackChain(start) {'.length, src.indexOf('\n\t\t\t}', at))
    .replace(/this\.fallbackChains\.get\(startKey\)/g, 'undefined')
    .replace(/this\.catalog/g, 'catalog')
    .replace(/this\.fallbackChains\.set\(startKey, resolved\);/g, '');

  const api = { console };
  vm.createContext(api);
  vm.runInContext(
    `function localeKey(value) { return value.toLowerCase(); }
function resolveChain(catalog, start) {${traversal}
}
function translate(state, ns, key, params) {
  const chain = resolveChain(state.catalog, state.active);
  let template;
  for (const locale of chain) {
    const value = state.dicts.get(ns)?.get(localeKey(locale))?.[key];
    if (value !== undefined) { template = value; break; }
  }
  if (template === undefined && ns !== 'common') {
    for (const locale of chain) {
      const value = state.dicts.get('common')?.get(localeKey(locale))?.[key];
      if (value !== undefined) { template = value; break; }
    }
  }
  if (template === undefined) template = key;
  if (!params) return template;
  return template.replace(/\\{(\\w+)\\}/g, (match, name) => (name in params ? String(params[name]) : match));
}
globalThis.__api = { resolveChain, translate };`,
    api,
  );

  const catalog = new Map(languages.map((entry) => [entry.id.toLowerCase(), entry]));
  return { dicts, packNamespaces, translate: api.__api.translate, resolveChain: api.__api.resolveChain, state: { catalog, dicts, active: 'tr' }, languages };
}

let registry;
let cached;
if (!SKIP) {
  registry = await import(pathToFileURL(join(ROOT, 'scripts/dsh-app.mjs')).href);
  cached = buildState();
}

test('the integration state builds from a real installation', { skip: SKIP }, () => {
  assert.ok(cached.packNamespaces.size > 0, 'the pack registered no namespaces');
  assert.ok(cached.dicts.size >= cached.packNamespaces.size, 'fewer namespaces than the pack registers');
});

test('Turkish enters the catalog and falls back to English', { skip: SKIP }, () => {
  const ids = cached.languages.map((entry) => entry.id);
  assert.ok(ids.includes('tr'), `catalog is ${ids.join(', ')}`);
  // Spread into a local array: the chain comes from a vm realm, whose Array
  // prototype differs from this module's.
  assert.deepEqual([...cached.resolveChain(cached.state.catalog, 'tr')], ['tr', 'en']);
});

test('the pack registers every namespace the installation ships', { skip: SKIP }, () => {
  const missing = [...cached.packNamespaces].length;
  assert.ok(missing > 0);
  for (const ns of cached.packNamespaces) {
    assert.ok(cached.dicts.get(ns)?.get('tr') !== undefined, `${ns} has no Turkish dictionary`);
  }
});

test('every translated key resolves to the Turkish value that was registered', { skip: SKIP }, () => {
  const { translate, state, packNamespaces, dicts } = cached;
  const wrong = [];
  let compared = 0;
  for (const ns of packNamespaces) {
    const tr = dicts.get(ns)?.get('tr');
    if (tr === undefined) continue;
    for (const [key, value] of Object.entries(tr)) {
      compared += 1;
      const got = translate(state, ns, key);
      if (got !== value) wrong.push(`${ns}.${key}: registered ${JSON.stringify(value)}, resolved ${JSON.stringify(got)}`);
    }
  }
  assert.ok(compared > 1000, `only ${compared} keys compared`);
  assert.deepEqual(wrong, [], wrong.slice(0, 5).join('; '));
});

test('a quoted string is readable once the pack is active', { skip: SKIP }, () => {
  const { translate, state } = cached;
  assert.equal(translate(state, 'common', 'cancel'), 'İptal');
  assert.equal(translate(state, 'settings', 'title'), 'Ayarlar');
  assert.equal(translate(state, 'settings.locale', 'language.title'), 'Dil');
});

test('placeholders still substitute inside Turkish copy', { skip: SKIP }, () => {
  const { translate, state, dicts } = cached;
  for (const [ns, byLocale] of dicts) {
    const tr = byLocale.get('tr');
    if (tr === undefined) continue;
    const key = Object.keys(tr).find((candidate) => /\{\w+\}/.test(String(tr[candidate])));
    if (key === undefined) continue;
    const name = /\{(\w+)\}/.exec(tr[key])[1];
    const rendered = translate(state, ns, key, { [name]: 'TEST' });
    assert.ok(rendered.includes('TEST'), `${ns}.${key} did not substitute ${name}: ${rendered}`);
    assert.ok(!rendered.includes(`{${name}}`), `${ns}.${key} left ${name} unsubstituted: ${rendered}`);
    return;
  }
  assert.fail('no Turkish value carries a placeholder');
});

test('a feature namespace falls through to the common dictionary', { skip: SKIP }, () => {
  const { translate, state } = cached;
  // `settings` owns no `copy` key; resolution continues into `common`.
  assert.equal(translate(state, 'settings', 'copy'), 'Kopyala');
});

test('selecting English renders English again', { skip: SKIP }, () => {
  const { translate, state } = cached;
  const english = { ...state, active: 'en' };
  assert.equal(translate(english, 'common', 'cancel'), 'Cancel');
});

test('an unknown key returns the key itself', { skip: SKIP }, () => {
  const { translate, state } = cached;
  const unknown = 'a.key.this.pack.does.not.carry';
  assert.equal(translate(state, 'common', unknown), unknown);
});
