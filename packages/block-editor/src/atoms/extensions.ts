import { type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { type EmojiItem, emojiItems, findEmoji, searchEmoji } from "@gotipe/core/emoji";
import {
  CustomEmoji,
  InlineImage,
  InlineMath,
  Mention,
  defineSuggestion,
  getInlineMath,
  insertCustomEmoji,
  insertInlineMath,
  insertMention,
} from "@gotipe/core/extensions";
import { defineExtension } from "@gotipe/core/js";
import { emojiNames, loadEmojiNames } from "./emoji-names";
import {
  type CustomEmojiItem,
  type MentionItem,
  atomHost,
  caretTarget,
  recentEmoji,
  rememberEmoji,
  requestAtomUI,
} from "./host";

/** A row of the “:” list: a Unicode emoji with its shown name, or a team's own emoji. */
export type EmojiChoice =
  | { kind: "unicode"; item: EmojiItem; label: string }
  | { kind: "custom"; item: CustomEmojiItem; label: string };

const LIMIT = 8;

/** Unicode and custom emoji for a query of the “:” list. */
export function searchEmojiChoices(editor: GoTipeEditor, query: string): EmojiChoice[] {
  const { locale, emoji } = atomHost(editor);
  const names = emojiNames(locale);
  const unicodeChoice = (item: EmojiItem): EmojiChoice => ({
    kind: "unicode",
    item,
    label: names?.[item.name] ?? item.name.replace(/_/g, " "),
  });
  // Right after “:” the list offers the recent emoji, then the first faces.
  if (!query) {
    const custom = new Map((emoji?.custom ?? []).map((item) => [`:${item.name}:`, item]));
    const recent = recentEmoji(editor).flatMap((value): EmojiChoice[] => {
      const own = custom.get(value);
      if (own) return [{ kind: "custom", item: own, label: value }];
      const item = findEmoji(value);
      return item ? [unicodeChoice(item)] : [];
    });
    const seen = new Set(recent.map((choice) => choice.label));
    const first = emojiItems("people")
      .map(unicodeChoice)
      .filter((choice) => !seen.has(choice.label));
    return [...recent, ...first].slice(0, LIMIT);
  }
  const needle = query.toLowerCase();
  const custom: EmojiChoice[] = (emoji?.custom ?? [])
    .filter((item) => item.name.toLowerCase().includes(needle))
    .map((item) => ({ kind: "custom", item, label: `:${item.name}:` }));
  const unicode = searchEmoji(query, LIMIT, names).map(unicodeChoice);
  return [...unicode, ...custom].slice(0, LIMIT);
}

/** Inserts an emoji over `range` (or at the caret) in one step and remembers it. */
export function insertEmoji(
  editor: GoTipeEditor,
  choice: { kind: "unicode"; emoji: string } | { kind: "custom"; item: CustomEmojiItem },
  range = caretTarget(editor),
): boolean {
  if (!range) return false;
  if (choice.kind === "custom") {
    const done = insertCustomEmoji(editor, choice.item, range);
    if (done) rememberEmoji(editor, `:${choice.item.name}:`);
    return done;
  }
  const { blockId, from, to } = range;
  const done = editor.dispatch({
    steps: [
      ...(to > from ? [{ type: "deleteText", blockId, from, to }] : []),
      { type: "insertText", blockId, offset: from, text: choice.emoji },
    ],
    selection: { type: "cursor", blockId, offset: from + choice.emoji.length },
  });
  if (done) rememberEmoji(editor, choice.emoji);
  return done;
}

/** The “@” list: people and pages from the host's `mentions.items`. */
export const MentionSuggestion = defineSuggestion<MentionItem>({
  name: "mentionSuggestion",
  char: "@",
  maxQueryLength: 40,
  items: (query, { signal, editor }) => atomHost(editor).mentions?.items(query, { signal }) ?? [],
  onSelect: (item, { editor, range }) => {
    insertMention(editor, { id: item.id, label: item.label, kind: item.kind ?? "user" }, range);
  },
});

/** The “:” list: Unicode emoji by name (localized names for `ru`) and the team's own. */
export const EmojiSuggestion = defineSuggestion<EmojiChoice>({
  name: "emojiSuggestion",
  char: ":",
  maxQueryLength: 30,
  // Russian names load with the first query of a Russian interface.
  items: async (query, { editor }) => {
    await loadEmojiNames(atomHost(editor).locale);
    return searchEmojiChoices(editor, query);
  },
  onSelect: (choice, { editor, range }) => {
    insertEmoji(
      editor,
      choice.kind === "custom" ? choice : { kind: "unicode", emoji: choice.item.emoji },
      range,
    );
  },
});

/**
 * `$x^2$` typed in a line: the closing `$` makes the TeX between the dollars a formula. As in
 * pandoc, the opening `$` is followed by neither a space nor a digit, so `costs $5-$` stays text.
 */
const DOLLAR = /(^|[^\p{L}\p{N}_$\\])\$([^$\s\d](?:[^$]*[^$\s\\])?)\$$/u;

/** “/” → Emoji opens the emoji picker at the caret (frame 23). */
export const EmojiCommand = defineExtension({
  name: "emojiCommand",
  slashCommands: [
    {
      name: "Emoji",
      aliases: ["emoji", "smile", "эмодзи", "смайлик"],
      icon: "smile",
      group: "insert",
      execute(editor) {
        // After the slash menu has removed its query and returned the caret and the focus.
        afterMenu(editor, () => {
          const at = caretTarget(editor);
          if (at) requestAtomUI(editor, { type: "emojiPicker", at });
        });
      },
    },
  ],
});

/**
 * Formulas in a line (frame 24): “/” → Inline formula opens the formula popover; typing `$…$`
 * makes a formula and opens it for a check.
 */
export const InlineMathCommands = defineExtension({
  name: "inlineMathCommands",
  inputRules: [
    {
      pattern: /\$[^$\s][^$]*\$/u,
      handler(editor) {
        const caret = caretTarget(editor);
        if (!caret || caret.from !== caret.to) return false;
        const text = blockText(editor, caret.blockId).slice(0, caret.to);
        const match = DOLLAR.exec(text);
        if (!match) return false;
        const from = match.index + match[1]!.length;
        let done = false;
        try {
          done = insertInlineMath(editor, match[2]!, {
            blockId: caret.blockId,
            from,
            to: caret.to,
          });
        } catch (error) {
          // A block whose text takes no formulas keeps the typed dollars.
          if (!(error instanceof GoTipeError && error.code === "VALIDATION_ERROR")) throw error;
        }
        if (!done) return false;
        const atom = getInlineMath(editor, { blockId: caret.blockId, offset: from + 1 });
        if (atom) requestAtomUI(editor, { type: "math", atom, created: true });
        return true;
      },
    },
  ],
  slashCommands: [
    {
      name: "Inline formula",
      aliases: ["math", "tex", "latex", "formula", "формула"],
      icon: "function",
      group: "insert",
      execute(editor) {
        afterMenu(editor, () => {
          const insert = caretTarget(editor);
          if (insert) requestAtomUI(editor, { type: "math", insert });
        });
      },
    },
  ],
});

/** Runs `open` once the command's own menu has finished with the editor. */
function afterMenu(editor: GoTipeEditor, open: () => void): void {
  setTimeout(() => {
    if (!editor.isDestroyed) open();
  }, 0);
}

function blockText(editor: GoTipeEditor, blockId: string): string {
  const find = (blocks: ReturnType<GoTipeEditor["getViewState"]>["blocks"]): string | null => {
    for (const block of blocks) {
      if (block.id === blockId)
        return Array.isArray(block.content) ? block.content.map((span) => span.text).join("") : "";
      const inner = find(block.children);
      if (inner !== null) return inner;
    }
    return null;
  };
  return find(editor.getViewState().blocks) ?? "";
}

/**
 * The extensions behind the block editor's mentions, emoji and formulas: the four atom marks,
 * the “@” and “:” lists and the commands. Add them when creating the editor; the data comes
 * from `BlockEditor`'s `mentions` and `emoji` props.
 */
export function atomExtensions() {
  return [
    Mention,
    InlineMath,
    CustomEmoji,
    InlineImage,
    MentionSuggestion,
    EmojiSuggestion,
    EmojiCommand,
    InlineMathCommands,
  ];
}
