import { PageEditor } from "@gotipe/block-editor";
import { createI18n, en, ru } from "@gotipe/i18n";
import { useMemo, useState } from "react";

// Applications can supply a custom locale. Untranslated Arabic preview keys
// intentionally use English, demonstrating a complete fallback dictionary.
const arPreview = {
  ...en,
  "page.ariaLabel": "محرر المستندات",
  "page.titlePlaceholder": "بدون عنوان",
  "page.placeholder.paragraph": "اكتب / لإضافة محتوى",
  "toolbar.bold": "غامق",
  "toolbar.italic": "مائل",
  "toolbar.underline": "تسطير",
  "slash.menuLabel": "المحتوى",
  "slash.text": "نص",
  "slash.heading1": "عنوان ١",
  "slash.heading2": "عنوان ٢",
  "slash.heading3": "عنوان ٣",
  "slash.table": "جدول",
  "slash.bulletList": "قائمة نقطية",
  "slash.orderedList": "قائمة مرقمة",
  "block.menu": "المحتوى",
  "block.delete": "حذف",
  "block.duplicate": "تكرار",
};
const LOCALES = [
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
  { id: "ar", label: "العربية — custom preview" },
];

export function I18nExample() {
  const [locale, setLocale] = useState("en");
  const i18n = useMemo(() => createI18n({ locale, locales: { en, ru, ar: arPreview } }), [locale]);
  const [markdown, setMarkdown] = useState(
    "Switch the locale to see translated UI labels. The custom Arabic preview uses right-to-left layout with English fallback labels.\n",
  );

  return (
    <div data-gotipe-example="i18n">
      <fieldset className="gotipe-example-actions">
        <legend>Interface language</legend>
        {LOCALES.map((item) => (
          <button
            type="button"
            className="gotipe-example-button"
            key={item.id}
            data-gotipe-locale={item.id}
            aria-pressed={locale === item.id}
            onClick={() => setLocale(item.id)}
          >
            {item.label}
          </button>
        ))}
      </fieldset>
      <div lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
        <PageEditor markdown={markdown} onChange={setMarkdown} i18n={i18n} />
      </div>
    </div>
  );
}
