import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor, EditorContent } from '@gotipe/react';
import { createI18n } from '@gotipe/i18n';
import { useState } from 'react';

const LOCALES = ['en', 'ru', 'ar', 'zh', 'ja', 'de', 'fr'] as const;

export function I18nExample() {
  const [locale, setLocale] = useState<string>('en');

  const editor = useEditor({
    extensions: [DefaultPreset, createI18n({ locale })],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          attrs: {},
          content: [
            {
              text: 'Switch the locale to see translated UI labels and RTL layout (Arabic).',
              marks: [],
            },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="i18n">
      <div style={{ marginBottom: '1rem' }}>
        {LOCALES.map((loc) => (
          <button
            key={loc}
            data-gotipe-locale={loc}
            className={locale === loc ? 'active' : ''}
            onClick={() => setLocale(loc)}
          >
            {loc.toUpperCase()}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
