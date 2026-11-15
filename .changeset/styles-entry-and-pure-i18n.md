---
"@gotipe/block-editor": patch
"@gotipe/i18n": patch
---

- `@gotipe/block-editor/styles` loads `@gotipe/theme/base.css` as well as `theme.css`: one import
  styles everything `BlockEditor` and `PageEditor` draw. Importing `base.css` beside it still
  works.
- `@gotipe/i18n` is free of side effects, as its `sideEffects: false` says: importing it no longer
  registers `en` and `ru` globally. `createI18n` still finds them by name after the dictionaries
  you pass and the ones `defineLocale` registered, so `createI18n({ locale: "ru" })` works as
  before. The unused peer dependency on `@gotipe/core` is gone.
