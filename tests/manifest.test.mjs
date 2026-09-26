/**
 * The published package contract.
 *
 * `dsh-client-modules` discovers a client plugin by reading its manifest: it
 * requires a `dsh.client` declaration with `platform: 'web'` and a resolvable
 * `./client` export, and the loader imports the `main` entry as the package's
 * host half. A manifest that drifts from those expectations fails at runtime
 * rather than at install time, so it is asserted here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('package is a discoverable dsh client plugin', () => {
  assert.equal(pkg.dsh?.client?.platform, 'web', 'dsh.client.platform must be "web"');
  assert.equal(pkg.exports?.['./client']?.default, './lib/client.js', 'exports["./client"] is required by the client scan');
});

test('package declares the locale service it depends on', () => {
  const inject = pkg.dsh?.client?.inject;
  assert.ok(Array.isArray(inject), 'dsh.client.inject must be an array');
  assert.ok(inject.includes('@deepseek-ai/dsh-client-locale'), 'the pack needs the locale package');
});

test('main entry resolves to a shipped file', () => {
  const main = pkg.main ?? pkg.exports?.['.']?.default;
  assert.equal(typeof main, 'string', 'package must declare a main entry');
  assert.ok(existsSync(join(ROOT, main)), `${main} does not exist`);
});

test('published payload covers both halves', () => {
  for (const file of ['lib/index.js', 'lib/client.js', 'README.md', 'LICENSE']) {
    assert.ok(pkg.files.includes(file), `files must include ${file}`);
    assert.ok(existsSync(join(ROOT, file)), `${file} does not exist`);
  }
});

test('the pack is discoverable through the expected keywords', () => {
  assert.ok(pkg.keywords.includes('dsh-plugin'), 'keyword "dsh-plugin" is the community discovery topic');
  assert.ok(pkg.keywords.includes('turkish'), 'keyword "turkish"');
});

test('the peer range matches the cordis version dsh ships', () => {
  const peer = pkg.peerDependencies?.['@deepseek-ai/cordis'];
  assert.equal(typeof peer, 'string', 'peerDependencies must declare @deepseek-ai/cordis');
});
