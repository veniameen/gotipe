# @gotipe/i18n

The UI strings of GoTipe: English and Russian dictionaries, `createI18n` with fallbacks and
plural forms, and typed translation keys. `@gotipe/react` and the ready UI read their labels,
placeholders and messages from it; the document itself is never translated.

[Docs](https://gotipe.com/docs/ui/i18n/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/i18n
```

`@gotipe/react` already depends on it.

## Usage

```ts
import { createI18n, en, ru } from "@gotipe/i18n";

export const i18n = createI18n({ locale: "ru", locales: { en, ru } });

i18n.t("media.addImage"); // "Добавить изображение" ("Add an image")
i18n.t("placeholder.heading", { level: 2 }); // "Заголовок 2" ("Heading 2")
```

Override strings by spreading a built-in dictionary, and pass the result to the UI:

```tsx
import { createI18n, en } from "@gotipe/i18n";
import { GoTipeI18nProvider } from "@gotipe/react";

const strings = createI18n({
  locale: "en",
  locales: { en: { ...en, "placeholder.paragraph": "Write something…" } },
});

// <GoTipeI18nProvider i18n={strings}>…</GoTipeI18nProvider>
```

- `createI18n({ locale, locales, fallbackLocale })`: an `I18n` with `t(key, params?)`,
  `plural(base, count, params?)`, `locale`, `setLocale(name)` and `addLocale(name, dictionary)`.
- `en`, `ru`: the built-in dictionaries. Always include `en`, the fallback.
- `pluralCategory`: the plural category (`one`, `few`, `many`) for a language and a count.
- Types: `Locale`, `I18n`, `TranslationKey`, `BaseTranslationKey`, `PluralKeyBase`.

A missing key falls back to the `fallbackLocale` dictionary, then to the key itself.

## License

MIT. See [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/i18n/LICENSE).
