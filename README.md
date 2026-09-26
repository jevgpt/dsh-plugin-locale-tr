# dsh-plugin-locale-tr

[![CI](https://github.com/OWNER/dsh-plugin-locale-tr/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/dsh-plugin-locale-tr/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-plugin-locale-tr.svg)](https://www.npmjs.com/package/dsh-plugin-locale-tr)
[![license](https://img.shields.io/npm/l/dsh-plugin-locale-tr.svg)](LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)

[Türkçe](README.tr.md) | English

Turkish (`tr`) language pack for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI.

DeepSeek Harness ships English and Simplified Chinese. This plugin adds Turkish as a third selectable language — **without modifying a single core file**. It uses the language-pack extension point that `@deepseek-ai/dsh-client-locale` documents for plugin authors:

- `ctx.locale.addLanguage({ id: 'tr', label: 'Türkçe', fallback: 'en' })` adds the catalog entry, which is what makes **Türkçe** appear in Settings → General → Language.
- `ctx.locale.register(namespace, 'tr', dictionary)` contributes the translated strings for each namespace.

## Coverage

| | |
|---|---|
| Namespaces | **45** |
| Strings | **1,870 / 1,870** |
| Target build | DeepSeek Harness `0.1.7-rc.2` |

Chat, sidebar, settings, tool results, plan mode, subagents, session trajectory, scheduled tasks, plugin manager, voice input, document/Excel/PDF preview, and keyboard shortcuts.

Any key this pack does not carry falls back along the locale chain to English, so the interface never renders a raw key name.

## Install

Until it is published to npm, install from a checkout:

```sh
# 1. Put the pack where your profile can resolve it
mkdir -p ~/.dsh/profiles/desktop/node_modules/dsh-plugin-locale-tr
cp -r package.json lib README.md LICENSE ~/.dsh/profiles/desktop/node_modules/dsh-plugin-locale-tr/

# 2. Declare it in the profile manifest
#    ~/.dsh/profiles/desktop/package.json
#    "dependencies": { "dsh-plugin-locale-tr": "file:/absolute/path/to/dsh-plugin-locale-tr" }
```

```yaml
# 3. Add it to the profile's patch layer
#    ~/.dsh/profiles/desktop/cordis.patch.yml
- insert:
    - id: locale-tr
      name: dsh-plugin-locale-tr
```

**The `insert` form is required.** A patch that carries a bare `id` targets an existing row; when no row matches, the loader warns and skips it, so `- id: locale-tr` alone silently loads nothing.

Restart DeepSeek Harness, then choose **Türkçe** in **Settings → General → Language**. The choice is durable, so it survives later restarts. A browser that reports Turkish as its language starts in Turkish without any selection.

## Remove

Delete the `- insert:` block from `cordis.patch.yml` and restart. Turkish disappears from the selector and the interface returns to the previously selected language.

## How it works

```
package.json          dsh.client declaration: platform "web", inject the locale package
lib/index.js          host half — intentionally empty; it exists so the package is a
                      legitimate Loader row the client scan can resolve
lib/client.js         browser half — generated, registers the language and dictionaries
src/dictionaries/     one file per namespace: the English/Chinese source rows this pack
                      was translated from, plus the Turkish values
scripts/              extract, build, verify, and drift-check tooling
tests/                integrity, placeholder, manifest and integration gates
```

The `dsh` client module loader discovers a package by reading its manifest: a `dsh.client` declaration with `platform: 'web'` plus a `./client` export. It then serves that bundle and calls its exported `apply` inside the client's Cordis fiber.

The bundle only ever calls the documented public API. It touches no private internals, so it keeps working as the client evolves — new UI strings simply fall back to English until they are translated here.

## Development

Requires Node.js 20 or later. No dependencies.

```sh
npm run build        # regenerate lib/client.js from src/dictionaries/
npm run verify       # load the bundle in a loader sandbox and assert its registrations
npm test             # dictionary integrity, placeholder, CJK and manifest gates
npm run test:all     # verify + test
```

`lib/client.js` is generated **and committed**, because dsh loads it straight from the installed package and npm consumers run no build step. CI rebuilds it and fails if the committed bytes differ.

### Integration check

`npm test` proves the artifact is well-formed. To also prove that Turkish actually resolves, run the integration suite against a real installation — it takes the app's own dictionaries, loads this pack on top of them, and drives the locale service's real lookup algorithm:

```sh
npx --yes @electron/asar extract "<resources>/app.asar" .dsh-extract
DSH_EXTRACT=.dsh-extract npm run test:e2e
```

It asserts that all 1,870 translated keys resolve to the Turkish value that was registered, that placeholders still substitute, that a feature namespace falls through to the common dictionary, and that selecting English still renders English. Without `DSH_EXTRACT` the suite skips with a reason, so `npm test` stays green on a clean checkout.

### Keeping up with dsh

A language pack is bound to the copy a build ships: when dsh gains keys, they fall back to English; when it drops keys, this pack carries dead entries. Neither breaks anything, so nothing surfaces the drift on its own.

```sh
# Extract app.asar once, then compare against that full package set
npx --yes @electron/asar extract "<resources>/app.asar" .dsh-extract
npm run check:drift -- --packages .dsh-extract/dsh/node_modules/@deepseek-ai
npm run extract -- --packages .dsh-extract/dsh/node_modules/@deepseek-ai
```

`check:drift` exits non-zero when keys are missing, so it works as a CI gate. `extract` rewrites `src/dictionaries/` while **preserving every existing translation** — only genuinely new keys appear as `null`. Translate those, then `npm run build`.

`scripts/dsh-app.mjs` locates an installed app automatically, but a desktop install keeps most packages inside `app.asar`, so pass `--packages` for a complete comparison. A partial set is detected and rejected with exit code 2 rather than reported as mass drift.

## Contributing

Corrections to the Turkish wording are the most valuable contribution. Edit `src/dictionaries/<namespace>.json`, run `npm run build && npm run test:all`, and open a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Notes

- Values that stay identical to English are deliberate: format templates (`{value}M`), unit suffixes (`{value} tok/s`), identifiers (`compact`, `export`), and technology names Turkish UIs conventionally leave untranslated (`JSON`, `Terminal`, `Markdown`).
- Product names, model ids, command tokens, and file extensions are never translated.
- The pack was generated against DeepSeek Harness `0.1.7-rc.2`. DSH is in developer preview and its strings change between releases; run the drift check after an update.

## License

[MIT](LICENSE). This is an unofficial community language pack and is not affiliated with DeepSeek AI.
