#!/usr/bin/env node
/**
 * Generate `lib/client.js` from `src/dictionaries/*.json`.
 *
 * The bundle targets the dsh dynamic client module format: it registers itself
 * on `window.__ModuleLoader__` and exports `apply` plus `inject`, which the
 * Client tree calls inside its own Cordis fiber.
 *
 * The emitted module only ever calls the documented language-pack API:
 * `ctx.locale.addLanguage` for the catalog entry and `ctx.locale.register` for
 * each namespace dictionary.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DICTS = join(ROOT, 'src', 'dictionaries');
const OUT = join(ROOT, 'lib', 'client.js');

/** Package name the module registers under; must match `package.json`. */
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name;
/** Locale this pack contributes. */
const LOCALE_ID = 'tr';
/** Label shown in Settings → General → Language. */
const LOCALE_LABEL = 'Türkçe';
/** Catalog fallback. English is always registered, so it is the only safe target. */
const LOCALE_FALLBACK = 'en';

if (!existsSync(DICTS)) throw new Error(`missing ${DICTS}; run \`npm run extract\` first`);

const entries = [];
const untranslated = [];

for (const file of readdirSync(DICTS).filter((name) => name.endsWith('.json')).sort()) {
  const record = JSON.parse(readFileSync(join(DICTS, file), 'utf8'));
  const { ns, rows, tr } = record;
  if (typeof ns !== 'string' || ns === '') throw new Error(`${file}: missing "ns"`);
  if (rows === null || typeof rows !== 'object') throw new Error(`${file}: missing "rows"`);

  const keys = Object.keys(rows).sort();
  const dict = {};
  const missing = [];
  for (const key of keys) {
    const value = tr?.[key];
    if (typeof value === 'string' && value.trim() !== '') dict[key] = value;
    else missing.push(key);
  }
  // A key without a translation is omitted rather than faked: the locale
  // service falls back along the chain and finally to English.
  if (missing.length > 0) untranslated.push({ ns, missing: missing.length, keys: missing.slice(0, 5) });
  entries.push({ ns, dict, keys: Object.keys(dict).length, total: keys.length });
}

const totalKeys = entries.reduce((sum, entry) => sum + entry.keys, 0);
const totalSourceKeys = entries.reduce((sum, entry) => sum + entry.total, 0);

const blocks = entries
  .map(({ ns, dict, keys, total }) => {
    const json = JSON.stringify(dict, null, 2)
      .split('\n')
      .map((line, index) => (index === 0 ? line : `\t\t${line}`))
      .join('\n');
    return `\t\t// ${ns} — ${keys}/${total} keys\n\t\tregister(ctx, ${JSON.stringify(ns)}, ${json});`;
  })
  .join('\n');

const source = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PACKAGE)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

\t\t/**
\t\t* Turkish language pack. The catalog, the fallback chain and the
\t\t* dictionary registry belong to the locale service; this bundle contributes
\t\t* one language definition and one dictionary per namespace. Every
\t\t* contribution goes through ctx.effect, so unloading the plugin removes it
\t\t* from both the selector and the lookup chain.
\t\t*/
\t\tconst LOCALE_ID = ${JSON.stringify(LOCALE_ID)};
\t\tconst LOCALE_LABEL = ${JSON.stringify(LOCALE_LABEL)};
\t\tconst LOCALE_FALLBACK = ${JSON.stringify(LOCALE_FALLBACK)};
\t\t/** Cordis service this pack depends on; the fiber waits for it to exist. */
\t\tconst inject = ["locale"];

\t\t/**
\t\t* Register one namespace's Turkish dictionary.
\t\t* @param ctx - client root context owning the effect.
\t\t* @param ns - dictionary namespace, owned by the feature package.
\t\t* @param dict - Turkish key/value pairs for that namespace.
\t\t*/
\t\tfunction register(ctx, ns, dict) {
\t\t\tctx.effect(
\t\t\t\t() => ctx.locale.register(ns, LOCALE_ID, dict),
\t\t\t\t${JSON.stringify(PACKAGE)} + ": " + ns + " dictionary"
\t\t\t);
\t\t}

\t\t/**
\t\t* Contribute the Turkish language and every namespace dictionary.
\t\t* Definitions and dictionaries may register in either order; keys this pack
\t\t* does not carry fall back to English.
\t\t* @param {object} ctx - client root context.
\t\t*/
\t\tfunction apply(ctx) {
\t\t\tctx.effect(
\t\t\t\t() => ctx.locale.addLanguage({ id: LOCALE_ID, label: LOCALE_LABEL, fallback: LOCALE_FALLBACK }),
\t\t\t\t${JSON.stringify(PACKAGE)} + ": language"
\t\t\t);
${blocks}
\t\t}

\t\texports.apply = apply;
\t\texports.inject = inject;
\t\texports.LOCALE_ID = LOCALE_ID;
\t\treturn module.exports;
\t}
});
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, source);
const bytes = Buffer.byteLength(source);
console.log(`namespaces: ${entries.length}`);
console.log(`keys: ${totalKeys}/${totalSourceKeys}`);
console.log(`lib/client.js: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KiB)`);
if (untranslated.length > 0) {
  console.log(`\nuntranslated keys (${untranslated.reduce((n, entry) => n + entry.missing, 0)} in ${untranslated.length} namespaces) — they fall back to English:`);
  for (const entry of untranslated) {
    console.log(`  ${entry.ns}: ${entry.missing} (${entry.keys.join(', ')}${entry.missing > entry.keys.length ? ', …' : ''})`);
  }
}
