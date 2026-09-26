# Contributing

Corrections to the Turkish wording are the most valuable contribution. The pack is generated, but the translations are hand-reviewed copy — if a string reads wrong in context, it is wrong.

## Fixing a translation

1. Find the key. `src/dictionaries/<namespace>.json` holds one namespace per file:

```jsonc
{
  "ns": "common",
  "pkg": "@deepseek-ai/dsh-client-locale",
  "tr": { "cancel": "İptal" },              // what you edit
  "rows": { "cancel": { "en": "Cancel", "zh": "取消" } }   // the source, for reference
}
```

2. Edit the `tr` value. Keep every `{placeholder}` token exactly as the English row spells it — those are substituted at runtime, so a renamed token corrupts the rendered string.
3. Rebuild and run the gates:

```sh
npm run build
npm run test:all
```

4. Open a pull request. State which screen the string appears on, so the reviewer can check it in context.

## Adding a translation after a dsh update

```sh
npx --yes @electron/asar extract "<resources>/app.asar" .dsh-extract
npm run extract -- --packages .dsh-extract/dsh/node_modules/@deepseek-ai
```

`extract` preserves every existing translation and writes `null` for keys that have none. Fill those in, then `npm run build`.

A key left as `null` is omitted from the bundle and falls back to English, which is safe but incomplete — the build script reports what is outstanding.

## What not to translate

- Product and technology names: `DeepSeek Harness`, `DSH`, `DeepSeek`, `JSON`, `HTTP`, `Markdown`, `Terminal`
- Model ids, command tokens, file extensions, CSS values, URLs, code identifiers
- Conventional key names: `Shift`, `Ctrl`, `Alt`, `Enter`, `Tab`, `Esc`
- Format templates and unit suffixes: `{value}M`, `{value} tok/s`, `{percent}%`

## Translation conventions

- Use the register Turkish software uses: `Kaydet`, `İptal`, `Sil`, `Ayarlar`, `Yeniden dene`.
- Apply Turkish orthography, including dotted/dotless i: `İptal`, `Etkinleştir`, `Devre dışı`, `İşlem`.
- Keep it short. These strings render in buttons, menu rows, badges, form labels and table cells.
- Prefer the English row as the source of truth; consult the Chinese row to disambiguate.

## Adding a whole language

This package is Turkish-specific by design. Another language is a separate pack built the same way: `ctx.locale.addLanguage` plus one `ctx.locale.register` per namespace. The tooling in `scripts/` is not language-specific — `scripts/build.mjs` and `scripts/verify.mjs` are the parts to copy.

## Repository conventions

- `lib/client.js` is generated and committed; never edit it by hand. Run `npm run build`.
- Files end with exactly one trailing newline.
- Keep `src/dictionaries/` source rows faithful to what the app ships — they are the translation brief, so do not edit `rows`.

## Known limitation of the tooling

`extract` and `check:drift` read dictionaries out of each package's `lib/client.js` bundle. A few packages instead ship per-locale JSON under `locale/*.json` (for example `dsh-experimental-agent-team`). Those are not read.

This is harmless for the targeted build: such packages are not mounted as client rows in the shipped web profile, so their namespaces are never looked up. If a future build starts mounting one, its strings fall back to English — add them to `src/dictionaries/` by hand, in the same schema.

