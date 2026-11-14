import type { GoTipeEditor } from "@gotipe/core";
import type { AtomInfo, AtomTarget } from "@gotipe/core/extensions";

/** A person or a page the «@» list offers (GoTipe Atlas, frame 22). */
export interface MentionItem {
  /** The host's id of the person or page. */
  id: string;
  /** The name shown and inserted. */
  label: string;
  /** `user` (default) is drawn with initials, `page` with the page glyph. */
  kind?: "user" | "page";
}

/** People and pages for the «@» list: the host searches its own directory. */
export interface MentionOptions {
  /** Items for a query (empty right after «@»). A newer query aborts `signal`. */
  items(query: string, context: { signal: AbortSignal }): MentionItem[] | Promise<MentionItem[]>;
}

/** A team's own emoji: `:name:` drawn as an image. */
export interface CustomEmojiItem {
  /** The shortcode without colons: letters, digits, `_`, `+` and `-`. */
  name: string;
  src: string;
}

/** Emoji of the «:» list and the picker (frame 23). */
export interface EmojiOptions {
  /** The team's emoji: listed after the Unicode ones and in their own tab. */
  custom?: CustomEmojiItem[];
  /** Recently used emoji to start with (Unicode characters or `:name:` of custom ones). */
  recent?: string[];
  /** Called with the new recent list after an emoji is inserted; persist it if you like. */
  onRecentChange?: (recent: string[]) => void;
}

/** What the host gave the editor's atom UI: data sources and the interface language. */
export interface AtomHost {
  mentions?: MentionOptions;
  emoji?: EmojiOptions;
  /** The locale of emoji names (`ru` searches Russian names). */
  locale?: string;
}

/** A request to open one of the atom popovers. */
export type AtomRequest =
  | { type: "emojiPicker"; at: AtomTarget }
  | { type: "math"; atom: AtomInfo; created?: boolean }
  | { type: "math"; insert: AtomTarget };

interface Entry {
  host: AtomHost;
  recent: string[];
  listeners: Set<(request: AtomRequest) => void>;
}

const RECENT_LIMIT = 18;
const entries = new WeakMap<GoTipeEditor, Entry>();
const entryOf = (editor: GoTipeEditor): Entry => {
  let entry = entries.get(editor);
  if (!entry) {
    entry = { host: {}, recent: [], listeners: new Set() };
    entries.set(editor, entry);
  }
  return entry;
};

/** Gives an editor's atom UI its host data; the block editor calls it with its props. */
export function setAtomHost(editor: GoTipeEditor, host: AtomHost): void {
  const entry = entryOf(editor);
  const first = !entry.host.emoji && host.emoji?.recent;
  entry.host = host;
  if (first) entry.recent = [...(host.emoji?.recent ?? [])].slice(0, RECENT_LIMIT);
}

export const atomHost = (editor: GoTipeEditor): AtomHost => entryOf(editor).host;

/** Recently used emoji, newest first (kept in memory per editor). */
export const recentEmoji = (editor: GoTipeEditor): readonly string[] => entryOf(editor).recent;

/** Moves `emoji` to the front of the recent list and tells the host. */
export function rememberEmoji(editor: GoTipeEditor, emoji: string): void {
  const entry = entryOf(editor);
  entry.recent = [emoji, ...entry.recent.filter((item) => item !== emoji)].slice(0, RECENT_LIMIT);
  entry.host.emoji?.onRecentChange?.([...entry.recent]);
}

/** Opens the emoji picker or the formula popover of a mounted atom UI. */
export function requestAtomUI(editor: GoTipeEditor, request: AtomRequest): boolean {
  const listeners = entryOf(editor).listeners;
  for (const listener of [...listeners]) listener(request);
  return listeners.size > 0;
}

export function onAtomRequest(
  editor: GoTipeEditor,
  listener: (request: AtomRequest) => void,
): () => void {
  const listeners = entryOf(editor).listeners;
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The collapsed caret as a target, or null. */
export function caretTarget(editor: GoTipeEditor): AtomTarget | null {
  const { selection } = editor.getViewState();
  if (selection.type !== "text" || selection.anchor.blockId !== selection.head.blockId) return null;
  const from = Math.min(selection.anchor.offset, selection.head.offset);
  const to = Math.max(selection.anchor.offset, selection.head.offset);
  return { blockId: selection.head.blockId, from, to };
}
