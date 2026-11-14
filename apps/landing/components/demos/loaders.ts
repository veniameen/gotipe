import type { ComponentType } from "react";
import type { DemoName } from "./names";

/**
 * One dynamic import per demo: each is its own chunk, fetched only when a page shows that demo.
 * Nothing here imports an editor package statically.
 */
export const DEMO_LOADERS: Record<DemoName, () => Promise<ComponentType>> = {
  "block-editor": () => import("./editors/block-editor").then((m) => m.BlockEditorDemo),
  "page-editor": () => import("./editors/page-editor").then((m) => m.PageEditorDemo),
  headless: () => import("./editors/headless").then((m) => m.HeadlessDemo),
  views: () => import("./editors/views").then((m) => m.ViewsDemo),
  lists: () => import("./editors/lists").then((m) => m.ListsDemo),
  marks: () => import("./editors/marks").then((m) => m.MarksDemo),
  tables: () => import("./editors/tables").then((m) => m.TablesDemo),
  media: () => import("./editors/media").then((m) => m.MediaDemo),
  code: () => import("./editors/code").then((m) => m.CodeDemo),
  collaboration: () => import("./editors/collaboration").then((m) => m.CollaborationDemo),
  comments: () => import("./editors/comments").then((m) => m.CommentsDemo),
  suggestions: () => import("./editors/suggestions").then((m) => m.SuggestionsDemo),
  versions: () => import("./editors/versions").then((m) => m.VersionsDemo),
  ai: () => import("./editors/ai").then((m) => m.AiDemo),
  i18n: () => import("./editors/i18n").then((m) => m.I18nDemo),
};
