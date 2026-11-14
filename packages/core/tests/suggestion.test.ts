import { afterEach, describe, expect, it } from "vitest";
import { EMOJI_SHORTCODES, emojiSource, searchEmoji } from "../src/emoji";
import type { EmojiItem } from "../src/emoji";
import { defineSuggestion } from "../src/extensions/suggestion";
import type { SuggestionEvent, SuggestionOptions } from "../src/extensions/suggestion";
import { detectTrigger } from "../src/extensions/suggestion/detect";
import { DefaultPreset } from "../src/presets";
import type { TextSpan } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { type Extension, defineExtension } from "../src/types/extension";
import { ENGINES, type Engine, createOn, doc, mountForTyping, paragraph } from "./engines";

const editors: GoTipeEditor[] = [];
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  for (const editor of editors.splice(0)) if (!editor.isDestroyed) editor.destroy();
});

const PEOPLE = ["Анна", "Антон", "Борис"];
const people = (query: string) => PEOPLE.filter((name) => name.startsWith(query));

function mentions(extra: Partial<SuggestionOptions<string>> = {}) {
  const selected: { item: string; range: unknown; query: string }[] = [];
  const suggestion = defineSuggestion<string>({
    char: "@",
    items: people,
    onSelect: (item, { range, query }) => selected.push({ item, range, query }),
    ...extra,
  });
  const events: SuggestionEvent<string>[] = [];
  cleanups.push(suggestion.on((event) => events.push(event)));
  return { suggestion, selected, events };
}

async function open(engine: Engine, content: string | TextSpan[], extensions: Extension[]) {
  const editor = await createOn(engine, {
    extensions: [...DefaultPreset, ...extensions],
    content: doc(paragraph("p", content)),
  });
  editors.push(editor);
  return editor;
}

const caret = (editor: GoTipeEditor, offset: number, blockId = "p") =>
  editor.setSelection({ anchor: { blockId, offset }, head: { blockId, offset } });
const type = (editor: GoTipeEditor, offset: number, text: string, blockId = "p") =>
  editor.dispatch({
    steps: [{ type: "insertText", blockId, offset, text, marks: [] }],
    selection: { type: "cursor", blockId, offset: offset + text.length },
  });
const kinds = (events: SuggestionEvent<unknown>[]) => events.map((event) => event.type);

describe.each(ENGINES)("defineSuggestion on %s", (engine) => {
  it("opens, follows the query, selects and closes", async () => {
    const { suggestion, selected, events } = mentions();
    const editor = await open(engine, "Привет ", [suggestion]);
    caret(editor, 7);
    expect(suggestion.state(editor)).toBeNull();
    type(editor, 7, "@");
    expect(suggestion.state(editor)).toMatchObject({
      query: "",
      range: { blockId: "p", from: 7, to: 8 },
      items: PEOPLE,
      selectedIndex: 0,
      loading: false,
      rect: null,
    });
    type(editor, 8, "Ан");
    expect(suggestion.state(editor)).toMatchObject({
      query: "Ан",
      range: { from: 7, to: 10 },
      items: ["Анна", "Антон"],
    });
    suggestion.move(editor, 1);
    expect(suggestion.state(editor)?.selectedIndex).toBe(1);
    suggestion.move(editor, 1);
    expect(suggestion.state(editor)?.selectedIndex).toBe(0);
    suggestion.move(editor, -1);
    expect(suggestion.state(editor)?.selectedIndex).toBe(1);
    expect(suggestion.select(editor)).toBe(true);
    expect(selected).toEqual([
      { item: "Антон", range: { blockId: "p", from: 7, to: 10 }, query: "Ан" },
    ]);
    expect(suggestion.state(editor)).toBeNull();
    expect(kinds(events)).toEqual([
      "open",
      "update",
      "update",
      "update",
      "update",
      "select",
      "close",
    ]);
    expect(events.at(-1)).toMatchObject({ type: "close", reason: "select" });
    // The selected trigger stays closed while the caret stays on it.
    caret(editor, 10);
    expect(suggestion.state(editor)).toBeNull();
    expect(suggestion.select(editor)).toBe(false);
  });

  it("closes on Escape until the caret leaves the trigger, and when the caret leaves", async () => {
    const { suggestion, events } = mentions();
    const editor = await open(engine, "x @Ан y", [suggestion]);
    caret(editor, 5);
    expect(suggestion.state(editor)?.query).toBe("Ан");
    suggestion.close(editor);
    expect(events.at(-1)).toMatchObject({ type: "close", reason: "escape" });
    caret(editor, 4);
    expect(suggestion.state(editor)).toBeNull();
    caret(editor, 7);
    caret(editor, 4);
    expect(suggestion.state(editor)?.query).toBe("А");
    caret(editor, 7);
    expect(suggestion.state(editor)).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: "close", reason: "caret" });
  });

  it("needs the start of a word unless told otherwise, and stops at spaces", async () => {
    const strict = mentions();
    const loose = mentions({ name: "loose", startOfWord: false, allowSpaces: true });
    const editor = await open(engine, "a@b c", [strict.suggestion, loose.suggestion]);
    caret(editor, 3);
    expect(strict.suggestion.state(editor)).toBeNull();
    expect(loose.suggestion.state(editor)?.query).toBe("b");
    caret(editor, 5);
    expect(strict.suggestion.state(editor)).toBeNull();
    expect(loose.suggestion.state(editor)?.query).toBe("b c");
    const leading = mentions({ allowSpaces: true });
    const second = await open(engine, "@ Анна\n@А", [leading.suggestion]);
    caret(second, 6);
    expect(leading.suggestion.state(second)).toBeNull();
    caret(second, 9);
    expect(leading.suggestion.state(second)?.query).toBe("А");
  });

  it("ignores triggers inside atoms and inline code", async () => {
    const { suggestion } = mentions();
    const atom = defineExtension({
      name: "atomTest",
      marks: [
        {
          name: "mention",
          attrs: { id: { type: "string" }, label: { type: "string" } },
          rank: 200,
          atomic: true,
        },
      ],
    });
    const editor = await open(
      engine,
      [
        { text: "@Анна", marks: [{ type: "mention", attrs: { id: "1", label: "Анна" } }] },
        { text: " ", marks: [] },
        { text: "@code", marks: [{ type: "code", attrs: {} }] },
      ],
      [atom, suggestion],
    );
    caret(editor, 5);
    expect(suggestion.state(editor)).toBeNull();
    caret(editor, 3);
    expect(suggestion.state(editor)).toBeNull();
    caret(editor, 11);
    expect(suggestion.state(editor)).toBeNull();
    type(editor, 6, "@");
    expect(suggestion.state(editor)?.range).toEqual({ blockId: "p", from: 6, to: 7 });
  });

  it("drops stale async results and aborts their requests", async () => {
    const pending: { query: string; signal: AbortSignal; resolve(items: string[]): void }[] = [];
    const { suggestion, events } = mentions({
      items: (query, { signal }) =>
        new Promise<string[]>((resolve) => pending.push({ query, signal, resolve })),
    });
    const editor = await open(engine, "", [suggestion]);
    type(editor, 0, "@");
    expect(suggestion.state(editor)).toMatchObject({ loading: true, items: [] });
    type(editor, 1, "Б");
    expect(pending.map(({ query }) => query)).toEqual(["", "Б"]);
    expect(pending[0]!.signal.aborted).toBe(true);
    expect(pending[1]!.signal.aborted).toBe(false);
    pending[1]!.resolve(["Борис"]);
    await Promise.resolve();
    await Promise.resolve();
    pending[0]!.resolve(["Анна"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(suggestion.state(editor)).toMatchObject({
      query: "Б",
      items: ["Борис"],
      loading: false,
    });
    expect(events.filter((event) => event.type === "update").length).toBe(2);
    // A result that arrives after the suggestion closed is ignored too.
    type(editor, 2, "о");
    suggestion.close(editor);
    expect(pending[2]!.signal.aborted).toBe(true);
    pending[2]!.resolve(["Борис"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(suggestion.state(editor)).toBeNull();
  });

  it("chooses nothing while the items of a new query load", async () => {
    const pending: ((items: string[]) => void)[] = [];
    const { suggestion, selected } = mentions({
      items: (query) =>
        query ? new Promise<string[]>((resolve) => pending.push(resolve)) : ["Анна", "Борис"],
    });
    const editor = await open(engine, "", [suggestion]);
    type(editor, 0, "@");
    expect(suggestion.state(editor)?.items).toEqual(["Анна", "Борис"]);
    type(editor, 1, "Б");
    expect(suggestion.state(editor)).toMatchObject({ query: "Б", loading: true });
    // The listed items are the previous query's: Enter does not pick "Анна".
    expect(suggestion.select(editor)).toBe(false);
    expect(selected).toEqual([]);
    pending[0]!(["Борис"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(suggestion.select(editor)).toBe(true);
    expect(selected.map(({ item }) => item)).toEqual(["Борис"]);
  });

  it("closes when the editor loses focus", async () => {
    const { suggestion, events } = mentions();
    const editor = await open(engine, "", [suggestion]);
    type(editor, 0, "@");
    expect(suggestion.state(editor)).not.toBeNull();
    editor.emit("blur", { editor });
    expect(suggestion.state(editor)).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: "close", reason: "blur" });
  });

  it("reports a failing source and keeps the menu empty", async () => {
    const errors: unknown[] = [];
    const { suggestion } = mentions({
      items: () => Promise.reject(new Error("offline")),
    });
    const editor = await open(engine, "", [suggestion]);
    editor.on("error", (error) => errors.push(error));
    type(editor, 0, "@");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(suggestion.state(editor)).toMatchObject({ items: [], loading: false });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "EXTENSION_ERROR", message: "offline" });
  });

  it("lets `@` and `:` coexist and inserts Unicode emoji as text", async () => {
    const people = mentions();
    const emoji = defineSuggestion<EmojiItem>({
      char: ":",
      source: emojiSource,
      onSelect: (item, { editor, range }) =>
        editor.dispatch({
          steps: [
            { type: "deleteText", blockId: range.blockId, from: range.from, to: range.to },
            { type: "insertText", blockId: range.blockId, offset: range.from, text: item.emoji },
          ],
          selection: {
            type: "cursor",
            blockId: range.blockId,
            offset: range.from + item.emoji.length,
          },
        }),
    });
    const editor = await open(engine, "", [people.suggestion, emoji]);
    type(editor, 0, "@А :tad");
    expect(people.suggestion.state(editor)).toBeNull();
    expect(emoji.state(editor)?.items).toEqual([
      { name: "tada", emoji: "🎉", category: "activities" },
    ]);
    expect(emoji.select(editor)).toBe(true);
    expect(editor.getText()).toBe("@А 🎉");
    expect(emoji.state(editor)).toBeNull();
    type(editor, 2, "н");
    expect(people.suggestion.state(editor)?.query).toBe("Ан");
    expect(emoji.state(editor)).toBeNull();
    editor.destroy();
    expect(people.events.at(-1)).toMatchObject({ type: "close", reason: "destroy" });
    expect(people.suggestion.state(editor)).toBeNull();
  });

  it("handles its keys only while open and leaves the slash menu working", async () => {
    const { suggestion, selected } = mentions();
    const editor = await open(engine, "Hi @Ан", [suggestion]);
    const view = mountForTyping(editor);
    cleanups.push(() => view.element.remove());
    let slash = 0;
    editor.on("openSlashMenu", () => slash++);
    view.caret("p", 2);
    expect(suggestion.state(editor)).toBeNull();
    for (const key of ["ArrowDown", "ArrowUp", "Escape"])
      expect(view.key(key).defaultPrevented).toBe(false);
    view.caret("p", 6);
    expect(suggestion.state(editor)?.items).toEqual(["Анна", "Антон"]);
    expect(view.key("ArrowDown").defaultPrevented).toBe(true);
    expect(view.key("ArrowUp").defaultPrevented).toBe(true);
    expect(view.key("ArrowUp").defaultPrevented).toBe(true);
    expect(view.key("Enter").defaultPrevented).toBe(true);
    expect(selected.map(({ item }) => item)).toEqual(["Антон"]);
    expect(view.key("Escape").defaultPrevented).toBe(false);
    view.caret("p", 2);
    view.type(" /");
    expect(slash).toBe(1);
  });
});

describe("trigger detection", () => {
  it("skips text whose view mark is atomic", () => {
    const rules = { char: "@", allowSpaces: false, startOfWord: true, maxQueryLength: 50 };
    const view = (offset: number) => ({
      blocks: [
        {
          id: "p",
          type: "paragraph",
          attrs: {},
          children: [],
          decorations: [],
          content: [
            { text: "@Анна", marks: [{ type: "mention", attrs: {}, atomic: true as const }] },
            { text: " @Б", marks: [] },
          ],
        },
      ],
      selection: {
        type: "text" as const,
        anchor: { blockId: "p", offset },
        head: { blockId: "p", offset },
      },
      decorations: [],
      toolbar: {
        activeMarks: [],
        activeBlockType: "paragraph",
        activeBlockAttrs: {},
        canUndo: false,
        canRedo: false,
      },
      version: 1,
    });
    expect(detectTrigger(view(5), rules)).toBeNull();
    expect(detectTrigger(view(2), rules)).toBeNull();
    expect(detectTrigger(view(8), rules)).toEqual({ blockId: "p", from: 6, to: 8, query: "Б" });
    expect(detectTrigger(view(0), rules)).toBeNull();
  });
});

describe("emoji shortcodes", () => {
  it("has unique names and finds prefix matches before substring matches", () => {
    const names = EMOJI_SHORTCODES.flatMap(([name, , ...aliases]) => [name, ...aliases]);
    expect(new Set(names).size).toBe(names.length);
    expect(EMOJI_SHORTCODES.length).toBeGreaterThanOrEqual(200);
    expect(searchEmoji("hear").map(({ name }) => name)).toEqual([
      "heart_eyes",
      "hear_no_evil",
      "heart",
      "smiling_face_with_three_hearts",
      "kissing_heart",
      "orange_heart",
      "yellow_heart",
      "green_heart",
      "blue_heart",
      "purple_heart",
    ]);
    expect(searchEmoji("THUMBS", 5)).toEqual([
      { name: "+1", emoji: "👍", category: "people" },
      { name: "-1", emoji: "👎", category: "people" },
    ]);
    expect(searchEmoji("party").map(({ name }) => name)).toEqual(["partying_face", "tada"]);
    expect(searchEmoji("", 3)).toHaveLength(3);
    expect(searchEmoji("zzzz")).toEqual([]);
  });
});
