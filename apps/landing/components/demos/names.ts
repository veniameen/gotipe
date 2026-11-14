/**
 * The live demos a documentation page can embed with a ```demo block (docs-site/README.md).
 * Plain data, no React: the docs checker and server components read it.
 */
export const DEMO_NAMES = [
  "block-editor",
  "page-editor",
  "headless",
  "views",
  "lists",
  "marks",
  "tables",
  "media",
  "code",
  "collaboration",
  "comments",
  "suggestions",
  "versions",
  "ai",
  "i18n",
] as const;

export type DemoName = (typeof DEMO_NAMES)[number];

export interface DemoMeta {
  /** What the window holds, read by assistive technology. */
  title: string;
  /** What to try, in a few words: it fits the bar on a phone. */
  hint: string;
  /** A second tag in the bar, e.g. that the AI answers come from a demo provider. */
  tag?: string;
}

export const DEMO_META: Record<DemoName, DemoMeta> = {
  "block-editor": {
    title: "Block editor",
    hint: "Type / for blocks",
  },
  "page-editor": {
    title: "Page editor with its Markdown",
    hint: "Markdown follows",
  },
  headless: { title: "Headless editor", hint: "Your own buttons" },
  views: { title: "Editor views", hint: "Switch the view" },
  lists: { title: "Lists", hint: "Tab nests items" },
  marks: { title: "Marks", hint: "Select to format" },
  tables: { title: "Tables", hint: "Tab between cells" },
  media: { title: "Image and file blocks", hint: "Drop in a file" },
  code: { title: "Code block", hint: "Pick a language" },
  collaboration: {
    title: "Two editors, one document",
    hint: "Type on either side",
  },
  comments: { title: "Comments", hint: "Select, then Comment" },
  suggestions: {
    title: "Track changes",
    hint: "Edits are tracked",
  },
  versions: { title: "Version history", hint: "Compare versions" },
  ai: {
    title: "AI in the editor",
    hint: "Pause, then Tab",
    tag: "Demo provider",
  },
  i18n: { title: "Interface language", hint: "Switch the language" },
};

export function isDemoName(name: string): name is DemoName {
  return (DEMO_NAMES as readonly string[]).includes(name);
}
