import { BlockEditor } from "@gotipe/block-editor";
import { DefaultPreset } from "@gotipe/core/presets";
import { createI18n, en, ru } from "@gotipe/i18n";
import { GoTipeI18nProvider, useEditor } from "@gotipe/react";
import { useMemo, useState } from "react";
import { documentOf, text } from "../frame/content";
import { Choice, DemoScroll, DemoTools } from "../frame/tools";
import { de } from "./i18n-de";
import "../frame/editor-styles";

const LOCALES = [
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
  { value: "de", label: "Deutsch (custom)" },
] as const;
type LocaleName = (typeof LOCALES)[number]["value"];

const DOCUMENT = documentOf("i18n", (b) => [
  b.heading(3, "Release notes"),
  b.paragraph(text("Offline drafts now sync as soon as the network returns.")),
  b.paragraph(),
]);

export function I18nDemo() {
  const editor = useEditor({ engine: "js", extensions: [DefaultPreset], content: DOCUMENT });
  const [locale, setLocale] = useState<LocaleName>("en");
  // A new I18n per language: the provider re-renders the UI with it.
  const i18n = useMemo(() => createI18n({ locale, locales: { en, ru, de } }), [locale]);
  return (
    <>
      <DemoTools label="Interface language">
        <Choice label="Language" options={LOCALES} value={locale} onChange={setLocale} />
      </DemoTools>
      <DemoScroll>
        <GoTipeI18nProvider i18n={i18n}>
          <BlockEditor editor={editor} showAiCommandBar={false} ariaLabel="Interface language" />
        </GoTipeI18nProvider>
      </DemoScroll>
    </>
  );
}
