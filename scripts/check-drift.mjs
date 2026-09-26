#!/usr/bin/env node
/**
 * Report how far this pack has drifted from a dsh installation's UI strings.
 *
 * A language pack is tied to the copy a given dsh build ships. When that build
 * gains keys, this pack silently falls back to English for them; when it drops
 * keys, this pack carries dead entries. Neither breaks the app, so nothing
 * surfaces the drift without an explicit check.
 *
 * Exits non-zero when keys are missing, so CI can gate on it.
 *
 * Usage:
 *   node scripts/check-drift.mjs [--packages <dir>] [--app <resources-dir>]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
  if (explicit !== undefined) return resolvePackagesArg(resolve(explicit));
  const appRoot = findAppRoot(option('app'));
  return findUnpackedPackages(appRoot) ?? resolvePackagesArg(appRoot);
}

const packagesRoot = resolvePackagesRoot();
if (packagesRoot === undefined || !existsSync(packagesRoot)) {
  console.error(
    'No readable @deepseek-ai packages.\n' +
      'Extract app.asar first and pass --packages <dir>/dsh/node_modules/@deepseek-ai',
  );
  process.exit(2);
}
console.log(`comparing against: ${packagesRoot}`);

/* ---- what the installed build ships ---- */
const shipped = new Map();
for (const [, src] of readClientBundles(packagesRoot)) {
  for (const [ns, dict] of extractPackageNamespaces(src)) {
    if (!shipped.has(ns)) shipped.set(ns, new Set());
    const keys = shipped.get(ns);
    for (const key of [...Object.keys(dict.en), ...Object.keys(dict.zh)]) {
      if (ns !== 'common' && key.startsWith('common.')) continue;
      keys.add(key);
    }
  }
}

/* ---- what this pack carries ---- */
const packed = new Map();
for (const file of readdirSync(DICTS).filter((name) => name.endsWith('.json'))) {
  const record = JSON.parse(readFileSync(join(DICTS, file), 'utf8'));
  if (isNamespace(record.ns)) packed.set(record.ns, new Set(Object.keys(record.rows ?? {})));
}

/* ---- compare ---- */
const addedNamespaces = [...shipped.keys()].filter((ns) => !packed.has(ns)).sort();
const droppedNamespaces = [...packed.keys()].filter((ns) => !shipped.has(ns)).sort();

const missing = [];
const extra = [];
const emptySource = [];
let shippedKeys = 0;
let packedKeys = 0;

for (const [ns, keys] of [...shipped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  shippedKeys += keys.size;
  const mine = packed.get(ns);
  if (mine === undefined) continue;
  packedKeys += mine.size;
  const absent = [...keys].filter((key) => !mine.has(key)).sort();
  if (absent.length > 0) missing.push({ ns, keys: absent });
  const gone = [...mine].filter((key) => !keys.has(key)).sort();
  if (gone.length > 0) extra.push({ ns, keys: gone });
}

console.log(`namespaces shipped: ${shipped.size}  packed: ${packed.size}`);
console.log(`keys shipped: ${shippedKeys}  packed: ${packedKeys}`);

// A desktop install's app.asar.unpacked holds only a handful of packages, so a
// partial input would report every other namespace as dropped. Say so instead
// of implying the pack is stale.
if (shipped.size < packed.size * 0.5) {
  console.error(
    `\nThis looks like a PARTIAL package set (${shipped.size} namespaces shipped vs ${packed.size} carried).\n` +
      'Point --packages at a full extraction of app.asar:\n' +
      '  npx --yes @electron/asar extract "<resources>/app.asar" <dir>\n' +
      '  node scripts/check-drift.mjs --packages <dir>/dsh/node_modules/@deepseek-ai',
  );
  process.exit(2);
}

if (addedNamespaces.length > 0) {
  console.log(`\nNEW namespaces not yet in this pack (${addedNamespaces.length}):`);
  for (const ns of addedNamespaces) console.log(`  ${ns} (${shipped.get(ns).size} keys)`);
}
if (droppedNamespaces.length > 0) {
  console.log(`\nnamespaces this pack carries that the build no longer registers (${droppedNamespaces.length}):`);
  for (const ns of droppedNamespaces) console.log(`  ${ns}`);
}
if (missing.length > 0) {
  const total = missing.reduce((sum, entry) => sum + entry.keys.length, 0);
  console.log(`\nNEW keys with no Turkish translation (${total} in ${missing.length} namespaces):`);
  for (const entry of missing) {
    console.log(`  ${entry.ns}: ${entry.keys.length} — ${entry.keys.slice(0, 6).join(', ')}${entry.keys.length > 6 ? ', …' : ''}`);
  }
}
if (extra.length > 0) {
  const total = extra.reduce((sum, entry) => sum + entry.keys.length, 0);
  console.log(`\nkeys this pack translates that the build no longer ships (${total}):`);
  for (const entry of extra) console.log(`  ${entry.ns}: ${entry.keys.length}`);
}

if (missing.length === 0 && addedNamespaces.length === 0) {
  const stale = droppedNamespaces.length + extra.length;
  console.log(
    '\nNo drift: this pack covers every key the installed build ships.' +
      (stale > 0 ? `\n${stale} stale entr${stale === 1 ? 'y' : 'ies'} above are informational — a key the build dropped is harmless, since nothing looks it up.` : ''),
  );
  process.exit(0);
}

console.log('\nRun `npm run extract` to refresh src/dictionaries, then translate the new keys and `npm run build`.');
process.exit(1);
