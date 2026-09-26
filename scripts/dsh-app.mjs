/**
 * Locate a DSH installation and read locale dictionaries out of its client
 * bundles.
 *
 * A language pack is tied to the UI strings a given dsh build ships, so the
 * dictionaries in `src/dictionaries/` are generated from an installed app
 * rather than hand-maintained. `scripts/extract.mjs` drives this module; the
 * locale-plugin internals it parses are described in
 * `@deepseek-ai/dsh-client-locale`.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir, platform } from 'node:os';

/** Absolute path of the DeepSeek Harness application resources directory. */
export function findAppRoot(explicit) {
  const candidates = [
    explicit,
    process.env.DSH_APP_ROOT,
    platform() === 'win32'
      ? join(homedir(), 'AppData', 'Local', 'Programs', 'DeepSeek Harness', 'resources')
      : undefined,
    platform() === 'darwin'
      ? '/Applications/DeepSeek Harness.app/Contents/Resources'
      : '/opt/DeepSeek Harness/resources',
  ].filter((value) => typeof value === 'string' && value !== '');
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'app.asar')) || existsSync(join(candidate, 'app.asar.unpacked'))) {
      return candidate;
    }
  }
  throw new Error(
    'Could not find a DeepSeek Harness installation. Pass the resources directory as the first argument or set DSH_APP_ROOT.',
  );
}

/** Directory holding the unpacked `@deepseek-ai` packages, when the install has one. */
export function findUnpackedPackages(appRoot) {
  const unpacked = join(appRoot, 'app.asar.unpacked', 'dsh', 'node_modules', '@deepseek-ai');
  return existsSync(unpacked) ? unpacked : undefined;
}

/**
 * Resolve a `--packages` argument, accepting either the `@deepseek-ai`
 * directory itself or any of the layouts that contain it: an extracted asar
 * checkout, its `node_modules`, or a package root.
 */
export function resolvePackagesArg(dir) {
  const candidates = [
    dir,
    join(dir, '@deepseek-ai'),
    join(dir, 'node_modules', '@deepseek-ai'),
    join(dir, 'dsh', 'node_modules', '@deepseek-ai'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'dsh-client-locale'))) return candidate;
    if (existsSync(candidate) && readdirSync(candidate).some((name) => name === 'dsh-base' || name.startsWith('dsh-'))) {
      return candidate;
    }
  }
  return undefined;
}

/* ------------------------------------------------------------- JS parsing */

/** Slice a balanced `{ … }` literal; the returned text excludes the outer brace. */
export function readObjectBody(src, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(openIndex, i);
    }
  }
  return null;
}

/** Every `const NAME = "text"` and `const NAME = { … }` binding in a bundle. */
export function buildSymbolTable(src) {
  const symbols = new Map();
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(\{|"|')/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    const name = match[1];
    if (match[2] === '{') {
      const body = readObjectBody(src, src.indexOf('{', match.index));
      if (body !== null) symbols.set(name, { kind: 'object', dict: parseFlatObject(body) });
    } else {
      const end = src.indexOf(match[2], match.index + match[0].length - 1);
      const close = src.indexOf(match[2], end + 1);
      if (close > end) symbols.set(name, { kind: 'string', value: src.slice(end + 1, close) });
    }
  }
  return symbols;
}

/** Flat `"key": "value"` pairs of an object body, with JS escapes resolved. */
export function parseFlatObject(body) {
  const out = {};
  const pair = /(?:^|[\s,{])(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let match;
  while ((match = pair.exec(body)) !== null) {
    const raw = match[3] !== undefined ? match[3] : match[4];
    out[match[1] !== undefined ? match[1] : match[2]] = raw
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }
  return out;
}

/** Skip a quoted string starting at `start`; returns the index after its closer. */
function skipString(src, start) {
  const quote = src[start];
  for (let i = start + 1; i < src.length; i += 1) {
    if (src[i] === '\\') {
      i += 1;
      continue;
    }
    if (src[i] === quote) return i + 1;
  }
  return src.length;
}

/** Argument text of the call whose `(` sits at `openParen`. */
export function readCallArguments(src, openParen) {
  let depth = 0;
  for (let i = openParen; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(src, i) - 1;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(openParen + 1, i);
    }
  }
  return null;
}

/** Split a call argument list on top-level commas. */
export function splitArguments(args) {
  const out = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = skipString(args, i);
      current += args.slice(i, end);
      i = end - 1;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '') out.push(current);
  return out;
}

/** A plausible locale namespace: short, no CSS-module noise, no whitespace. */
export function isNamespace(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 60 &&
    /^[A-Za-z][\w.-]*$/.test(name)
  );
}

/**
 * Every locale namespace a package's client bundle registers, with the
 * dictionaries it passes.
 *
 * A namespace may be registered more than once — `dsh-client-locale` registers
 * `settings.locale` for the language row and again for the shared base
 * vocabulary — so each site contributes its own keys and the caller merges.
 *
 * @param src - the bundle's source text.
 * @returns namespace name to `{ en, zh }` dictionary pair.
 */
export function extractPackageNamespaces(src) {
  const symbols = buildSymbolTable(src);
  const dicts = new Map();
  for (const [name, symbol] of symbols) {
    if (symbol.kind !== 'object') continue;
    const keys = Object.keys(symbol.dict);
    if (keys.length === 0) continue;
    if (!keys.every((key) => /^[\w][\w.-]*$/.test(key))) continue;
    dicts.set(name, symbol.dict);
  }
  /**
   * Resolve a dictionary const by name. An exact declaration wins over the
   * bundler's `$n`-suffixed sibling: `zh` and `zh$1` coexist in
   * dsh-client-locale with different key sets, so prefix matching alone would
   * silently bind the wrong dictionary.
   */
  const findDict = (base) => {
    if (dicts.has(base)) return dicts.get(base);
    for (const [name, dict] of dicts) if (name.startsWith(`${base}$`)) return dict;
    return null;
  };

  const found = new Map();
  const callRe = /(?:ctx\.)?locale\.register\s*\(/g;
  let call;
  while ((call = callRe.exec(src)) !== null) {
    const openParen = src.indexOf('(', call.index + call[0].length - 1);
    const argsSource = readCallArguments(src, openParen);
    if (argsSource === null) continue;
    const args = splitArguments(argsSource);
    const ns = resolveString(args[0] ?? '', symbols);
    if (ns === null || !isNamespace(ns)) continue;

    const en = {};
    const zh = {};
    for (let i = 1; i < args.length; i += 1) {
      const arg = args[i].trim();
      if (!arg.startsWith('{')) continue;
      const body = readObjectBody(arg, arg.indexOf('{'));
      if (body === null) continue;
      const refs = [...body.matchAll(/(?:^|[^\w$])([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
      const enRefs = refs.filter((ref) => /^en(\$|$)/.test(ref));
      const zhRefs = refs.filter((ref) => /^zh(\$|$)/.test(ref));
      const before = Object.keys(en).length + Object.keys(zh).length;
      for (const ref of enRefs) Object.assign(en, findDict(ref) ?? {});
      for (const ref of zhRefs) Object.assign(zh, findDict(ref) ?? {});
      // Inline dictionary with no resolvable refs: the per-locale form's payload.
      if (Object.keys(en).length + Object.keys(zh).length === before) {
        const inline = parseFlatObject(body);
        const keys = Object.keys(inline);
        if (keys.length && keys.every((key) => /^[\w][\w.-]*$/.test(key))) Object.assign(en, inline);
      }
    }
    if (Object.keys(en).length + Object.keys(zh).length === 0) continue;
    if (!found.has(ns)) found.set(ns, { en: {}, zh: {} });
    const record = found.get(ns);
    for (const [lang, dict] of [
      ['en', en],
      ['zh', zh],
    ]) {
      for (const [key, value] of Object.entries(dict)) {
        // The shared `common` dictionary must not leak into a feature namespace.
        if (ns !== 'common' && key.startsWith('common.')) continue;
        if (typeof value === 'string' && !(key in record[lang])) record[lang][key] = value;
      }
    }
  }
  return found;
}

/** Resolve a register call's namespace argument to its literal text. */
function resolveString(argSource, symbols) {
  const text = argSource.trim();
  if (text.startsWith('"') || text.startsWith("'")) {
    const close = text.indexOf(text[0], 1);
    return close > 0 ? text.slice(1, close) : null;
  }
  const symbol = symbols.get(text);
  return symbol?.kind === 'string' ? symbol.value : null;
}

/**
 * Packages under `@deepseek-ai` whose client bundle registers locale dictionaries.
 * @param packagesRoot - directory holding the `@deepseek-ai` packages.
 * @returns package name to bundle source, for web client packages only.
 */
export function readClientBundles(packagesRoot) {
  const bundles = new Map();
  for (const entry of readdirSync(packagesRoot)) {
    const bundle = join(packagesRoot, entry, 'lib', 'client.js');
    if (!existsSync(bundle) || !statSync(bundle).isFile()) continue;
    const src = readFileSync(bundle, 'utf8');
    if (!src.includes('locale.register')) continue;
    bundles.set(entry, src);
  }
  return bundles;
}

/** True when `dir` looks like a dsh profile with a user patch layer. */
export function isProfileDir(dir) {
  return existsSync(join(dir, 'cordis.patch.yml')) && existsSync(join(dir, 'package.json'));
}

/** Default desktop profile directory, or undefined when it does not exist. */
export function defaultProfileDir() {
  const dir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', 'desktop');
  return isProfileDir(dir) ? dir : undefined;
}

export { dirname, basename };
