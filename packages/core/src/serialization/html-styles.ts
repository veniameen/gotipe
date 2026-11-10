/** Neutral document styles for standalone exports; no application theme dependency. */
export const BLOCK_STYLES: Readonly<Record<string, string>> = {
  paragraph: "margin:0 0 0.75em;line-height:1.5;overflow-wrap:anywhere",
  heading: "margin:1em 0 0.5em;line-height:1.25;overflow-wrap:anywhere",
  bulletList: "padding-left:1.5em;margin:0.5em 0",
  orderedList: "padding-left:1.5em;margin:0.5em 0",
  todoList: "list-style:none;padding-left:0;margin:0.5em 0",
  listItem: "line-height:1.5",
  todoItem: "line-height:1.5;list-style:none",
  codeBlock:
    "white-space:pre;overflow-x:auto;max-width:100%;padding:1em;background:#f5f5f5;color:#202020",
  blockquote: "margin:1em 0;padding-left:1em;border-left:3px solid #a0a0a0",
  divider: "border:0;border-top:1px solid #a0a0a0;margin:1em 0",
  callout: "padding:1em;border:1px solid #a0a0a0;border-radius:0.375em",
  image: "margin:1em 0;max-width:100%;overflow:auto",
  table: "border-collapse:collapse;max-width:100%",
  tableCell: "padding:0.5em;border:1px solid #a0a0a0;vertical-align:top",
  tableHeader: "padding:0.5em;border:1px solid #a0a0a0;vertical-align:top;font-weight:bold",
  toggle: "margin:0.75em 0",
  columns: "display:flex;flex-wrap:wrap;gap:1em",
  column: "flex:1 1 12em;min-width:0",
};
