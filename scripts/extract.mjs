#!/usr/bin/env node
/**
 * Extract the English and Chinese locale dictionaries a dsh build ships, and
 * rewrite `src/dictionaries/<namespace>.json` with the English source text for
 * every key.
 *
 * Existing Turkish translations are preserved: a key that already has a
 * translation keeps it, and only genuinely new keys appear as untranslated
 * (`tr: null`). Run this after a dsh update, translate the new keys, then run
 * `npm run build`.
 *
 * Usage:
 *   node scripts/extract.mjs [--packages <dir>] [--app <resources-dir>]
 *
 *   --packages  a directory holding the `@deepseek-ai` packages (an extracted
 *               asar checkout, or app.asar.unpacked/dsh/node_modules/@deepseek-ai)
 *   --app       the DeepSeek Harness `resources` directory to read from
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findAppRoot,
  resolvePackagesArg,
  findUnpackedPackages,
  readClientBundles,
  extractPackageNamespaces,
  isNamespace,
} from './dsh-app.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DICTS = join(ROOT, 'src', 'dictionaries');

/** Read `--name value` from argv. */
function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : undefined;
}

function resolvePackagesRoot() {
  const explicit = option('packages');
  if (explicit !== undefined) {
    const resolved = resolvePackagesArg(resolve(explicit));
    if (resolved === undefined) throw new Error(`No @deepseek-ai packages under ${explicit}`);
    return resolved;
  }
  const appRoot = findAppRoot(option('app'));
  // A desktop install keeps most runtime packages inside app.asar, so
  // app.asar.unpacked holds only a partial set. Prefer a fully extracted
  // checkout whenever one is reachable through the resources directory.
  const fromApp = resolvePackagesArg(appRoot);
  if (fromApp !== undefined && existsSync(join(fromApp, 'dsh-client-ui-chat'))) return fromApp;
  const unpacked = findUnpackedPackages(appRoot);
  if (unpacked !== undefined) return unpacked;
  throw new Error(
    `No readable @deepseek-ai packages under ${appRoot}.\n` +
      'The desktop install keeps most packages inside app.asar. Extract it first:\n' +
      `  npx --yes @electron/asar extract "${join(appRoot, 'app.asar')}" <dir>\n` +
      'then run: node scripts/extract.mjs --packages <dir>/dsh/node_modules/@deepseek-ai',
  );
}

/** Existing Turkish dictionary files, keyed by namespace. */
function readExistingTranslations() {
  const existing = new Map();
  if (!existsSync(DICTS)) return existing;
  for (const file of readdirSync(DICTS)) {
    if (!file.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(join(DICTS, file), 'utf8'));
    if (isNamespace(parsed.ns)) existing.set(parsed.ns, parsed);
  }
  return existing;
}

const packagesRoot = resolvePackagesRoot();
console.log(`packages: ${packagesRoot}`);
const bundles = readClientBundles(packagesRoot);
console.log(`client bundles with locale dictionaries: ${bundles.size}`);

/** ns -> { pkg, en, zh } */
const namespaces = new Map();
for (const [pkg, src] of bundles) {
  for (const [ns, dict] of extractPackageNamespaces(src)) {
    if (!namespaces.has(ns)) namespaces.set(ns, { pkg, en: {}, zh: {} });
    const record = namespaces.get(ns);
    for (const [lang, values] of [
      ['en', dict.en],
      ['zh', dict.zh],
    ]) {
      for (const [key, value] of Object.entries(values)) {
        if (typeof value === 'string' && !(key in record[lang])) record[lang][key] = value;
      }
    }
  }
}

const existing = readExistingTranslations();
mkdirSync(DICTS, { recursive: true });

let totalKeys = 0;
let newKeys = 0;
let translatedKeys = 0;
const renamed = [];
const written = [];

for (const [ns, record] of [...namespaces.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const keys = [...new Set([...Object.keys(record.en), ...Object.keys(record.zh)])].sort();
  if (keys.length === 0) continue;
  const previous = existing.get(ns);
  const tr = {};
  const rows = {};
  for (const key of keys) {
    const english = record.en[key] ?? null;
    const chinese = record.zh[key] ?? null;
    const prior = previous?.tr?.[key];
    if (typeof prior === 'string' && prior.trim() !== '') {
      tr[key] = prior;
      translatedKeys += 1;
    } else {
      tr[key] = null;
      newKeys += 1;
    }
    rows[key] = { en: english, zh: chinese };
  }
  totalKeys += keys.length;
  const file = `${ns.replace(/[^\w.-]/g, '_')}.json`;
  writeFileSync(
    join(DICTS, file),
    `${JSON.stringify({ ns, pkg: record.pkg, tr, rows }, null, 2)}\n`,
  );
  written.push({ ns, keys: keys.length, file });
  if (previous !== undefined && previous.pkg !== record.pkg) {
    renamed.push(`${ns}: ${previous.pkg} -> ${record.pkg}`);
  }
  for (const [name] of existing) {
    if (!namespaces.has(name)) renamed.push(`${name}: no longer registered (stale file kept in src/dictionaries)`);
  }
}

// Fold the previous flat files into the new shape so a fresh checkout stays consistent.
console.log(`\nnamespaces: ${written.length}  keys: ${totalKeys}`);
console.log(`translated: ${translatedKeys}  awaiting translation: ${newKeys}`);
if (renamed.length) {
  console.log('\nchanges worth reviewing:');
  for (const line of [...new Set(renamed)]) console.log(`  ${line}`);
}
if (newKeys > 0) {
  console.log('\nNext: fill the null values in src/dictionaries/*.json, then run `npm run build`.');
}
const stale = [...existing.keys()].filter((ns) => !namespaces.has(ns));
if (stale.length) console.log(`stale namespaces not seen in this build: ${stale.join(', ')}`);
