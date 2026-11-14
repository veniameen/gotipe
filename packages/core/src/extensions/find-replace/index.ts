import type { GoTipeEditor } from "../../types/editor";
import { defineExtension } from "../../types/extension";
import { editorScoped } from "../scoped";
import { FindReplaceController, type FindReplaceOptions } from "./controller";

export { FindReplaceController, SEARCH_LAYER } from "./controller";
export type { FindReplaceOptions, FindReplaceState } from "./controller";
export type { SearchErrorCode, SearchFailure, SearchMatch, SearchQuery } from "./search";

const DEFAULTS: FindReplaceOptions = {
  includeRaw: false,
  maxMatches: 1000,
  timeout: 200,
  matchClass: "gotipe-match",
  currentClass: "is-current",
};

const controllers = editorScoped<FindReplaceController>();

/**
 * Find and replace without UI: the query and its matches, the current match, replacing it or
 * all of them as one undo step, and the `search` decoration layer. Read it with
 * `getFindReplace(editor)`.
 */
export const FindReplace = defineExtension<FindReplaceOptions>({
  name: "findReplace",
  options: DEFAULTS,
  onCreate(editor) {
    controllers.attach(editor, new FindReplaceController(editor, { ...DEFAULTS, ...this.options }));
  },
  onDestroy(editor) {
    controllers.detach(editor);
  },
});

/** The search of an editor with `FindReplace`; `null` without it or after destroy. */
export function getFindReplace(editor: GoTipeEditor): FindReplaceController | null {
  return controllers.get(editor);
}
