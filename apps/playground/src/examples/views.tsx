import { BlockEditor, FixedToolbar, PageHead } from "@gotipe/block-editor";
import {
  codeLanguageAliases,
  codeLanguages,
  createShikiHighlighter,
  gotipeCodeThemeLoader,
} from "@gotipe/block-editor/shiki";
import {
  CharacterCount,
  FindReplace,
  FontFamily,
  FontSize,
  InvisibleCharacters,
  TextAlign,
  TextDirection,
  getCharacterCount,
} from "@gotipe/core/extensions";
import { FullPreset } from "@gotipe/core/presets";
import { GoTipeI18nProvider, useEditor } from "@gotipe/react";
import type { ThemePreset } from "@gotipe/theme";
import { useEffect, useState } from "react";
import { ExampleWrapper } from "../shared/example-wrapper";
import { useDebugEditor } from "../shared/use-debug-editor";
import { ATLAS_DOCUMENT, ATLAS_TITLE } from "./views/document";

const VIEWS: ThemePreset[] = ["notion", "docs", "modern", "minimal"];
/** Shiki with the GoTipe code theme: grammars load on first use, colours follow the theme. */
const highlight = createShikiHighlighter({
  langs: codeLanguages,
  aliases: codeLanguageAliases,
  themes: { light: gotipeCodeThemeLoader, dark: gotipeCodeThemeLoader },
});
const STATES = ["document", "empty page", "loading", "read only"] as const;
const LANGUAGES = ["ru", "en"] as const;
/** The counter under the document (Atlas frame 26): off, plain, or near and over a host limit. */
const COUNTERS = ["off", "words", "near limit", "over limit"] as const;
type Counter = (typeof COUNTERS)[number];
/** Find, the counter, alignment, direction, fonts and invisibles (Atlas frames 25–28). */
const TEXT_EXTENSIONS = [
  FindReplace,
  CharacterCount,
  TextAlign,
  TextDirection,
  FontFamily,
  FontSize,
  InvisibleCharacters,
];
type State = (typeof STATES)[number];

/** The page glyph of the Atlas document: a cloud with a gap. The host chooses it. */
function CloudOffIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 12.5h7a2.75 2.75 0 0 0 .55-5.45A4 4 0 0 0 5.2 5.4M3.6 7.35A2.6 2.6 0 0 0 4.5 12.5M2.5 2.5l11 11" />
    </svg>
  );
}

function Byline() {
  return (
    <>
      <span className="gotipe-avatars">
        <span className="gotipe-avatar" data-person="2">
          МЛ
        </span>
        <span className="gotipe-avatar" data-person="1">
          ИО
        </span>
      </span>
      Мария Лебедева и Илья Орлов · изменено 11 ноября в 14:32
    </>
  );
}

/** One document in the four views of the GoTipe Atlas (frames 1–5, 11 and 17). */
export function ViewsExample() {
  const editor = useEditor({
    extensions: [FullPreset, ...TEXT_EXTENSIONS],
    content: ATLAS_DOCUMENT,
  });
  const [counter, setCounter] = useState<Counter>("off");
  const characters = (editor && getCharacterCount(editor)?.characters()) ?? 0;
  const [view, setView] = useState<ThemePreset>("notion");
  const [state, setState] = useState<State>("document");
  const [title, setTitle] = useState(ATLAS_TITLE);
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]>("ru");
  useDebugEditor("__GOTIPE_VIEWS_EDITOR__", editor);

  useEffect(() => {
    if (!editor) return;
    if (state === "empty page") {
      editor.setContent({
        version: 1,
        blocks: [{ id: "empty", type: "paragraph", attrs: {}, content: [], children: [] }],
      });
      setTitle("");
    } else if (state === "document" || state === "read only") {
      editor.setContent(ATLAS_DOCUMENT);
      setTitle(ATLAS_TITLE);
    }
    editor.setEditable(state !== "read only");
  }, [editor, state]);

  const header =
    view === "notion" || view === "docs" ? (
      <PageHead
        icon={state === "empty page" ? undefined : <CloudOffIcon />}
        onAddIcon={() => undefined}
        title={title}
        onTitleChange={setTitle}
        onTitleEnter={() => editor?.focus("start")}
        byline={state === "empty page" ? undefined : <Byline />}
        readOnly={state === "read only" ? "Только чтение: страница в архиве" : undefined}
      />
    ) : undefined;

  return (
    <ExampleWrapper
      title="Views"
      description="The same document in the four views of the GoTipe Atlas. A view is a set of --gt-* tokens over one markup: the BlockEditor view prop sets data-gt-view."
      tags={["Commercial"]}
    >
      <fieldset className="gotipe-example-actions">
        <legend>View</legend>
        {VIEWS.map((name) => (
          <button
            key={name}
            type="button"
            className="gotipe-example-button"
            aria-pressed={view === name}
            onClick={() => setView(name)}
          >
            {name}
          </button>
        ))}
      </fieldset>
      <fieldset className="gotipe-example-actions">
        <legend>State</legend>
        {STATES.map((name) => (
          <button
            key={name}
            type="button"
            className="gotipe-example-button"
            aria-pressed={state === name}
            onClick={() => setState(name)}
          >
            {name}
          </button>
        ))}
      </fieldset>
      <fieldset className="gotipe-example-actions">
        <legend>Language</legend>
        {LANGUAGES.map((name) => (
          <button
            key={name}
            type="button"
            className="gotipe-example-button"
            aria-pressed={language === name}
            onClick={() => setLanguage(name)}
          >
            {name}
          </button>
        ))}
      </fieldset>
      <fieldset className="gotipe-example-actions">
        <legend>Counter</legend>
        {COUNTERS.map((name) => (
          <button
            key={name}
            type="button"
            className="gotipe-example-button"
            aria-pressed={counter === name}
            onClick={() => setCounter(name)}
          >
            {name}
          </button>
        ))}
      </fieldset>
      <GoTipeI18nProvider locale={language}>
        <div className="gotipe-views-frame" data-gt-view={view}>
          {view === "modern" && editor && state !== "loading" && <FixedToolbar editor={editor} />}
          <BlockEditor
            editor={state === "loading" ? null : editor}
            view={view}
            header={state === "loading" ? undefined : header}
            highlight={highlight}
            showAiCommandBar={false}
            status={
              counter === "off"
                ? false
                : counter === "words"
                  ? true
                  : {
                      // a host's limit shown, not enforced: a little above or below the text
                      limit: Math.round(characters * (counter === "near limit" ? 1.02 : 0.9)),
                      reason:
                        language === "ru"
                          ? "Описание выпуска — не больше этого числа символов"
                          : "Release notes stay within this many characters",
                    }
            }
          />
        </div>
      </GoTipeI18nProvider>
    </ExampleWrapper>
  );
}
