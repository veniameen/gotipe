import type { WasmEditor } from "@gotipe/wasm";
import { GoTipeError } from "./error";

let initPromise: Promise<void> | null = null;
let wasmModule: typeof import("@gotipe/wasm") | null = null;

// ---- JS fallback transform engine ----
// Applies WASM-format transactions to a plain JS document when WASM is unavailable.

interface FallbackMark {
  mark_type: string;
  attrs: Record<string, unknown>;
}

interface FallbackSpan {
  text: string;
  marks: FallbackMark[];
}

interface FallbackBlock {
  id: string;
  block_type: string;
  attrs: Record<string, unknown>;
  content: { type: "RichText"; value: FallbackSpan[] } | { type: "Raw"; value: string } | { type: "Empty" };
  children: FallbackBlock[];
}

interface FallbackDoc {
  version: number;
  blocks: FallbackBlock[];
}

function findBlockById(blocks: FallbackBlock[], id: string): FallbackBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    const found = findBlockById(b.children, id);
    if (found) return found;
  }
  return null;
}

function marksEqual(a: FallbackMark[], b: FallbackMark[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.mark_type !== b[i]!.mark_type) return false;
    if (JSON.stringify(a[i]!.attrs) !== JSON.stringify(b[i]!.attrs)) return false;
  }
  return true;
}

/** Normalize adjacent spans with identical marks into a single span. */
function normalizeSpans(spans: FallbackSpan[]): FallbackSpan[] {
  const result: FallbackSpan[] = [];
  for (const span of spans) {
    if (span.text === "") continue;
    const last = result[result.length - 1];
    if (last && marksEqual(last.marks, span.marks)) {
      last.text += span.text;
    } else {
      result.push({ text: span.text, marks: span.marks.map((m) => ({ ...m })) });
    }
  }
  return result;
}

function getRichTextSpans(block: FallbackBlock): FallbackSpan[] {
  if (block.content.type !== "RichText") return [];
  return block.content.value;
}

function setRichTextSpans(block: FallbackBlock, spans: FallbackSpan[]): void {
  block.content = { type: "RichText", value: normalizeSpans(spans) };
}

/** Split spans at a character offset, returning [before, after]. */
function splitSpansAt(spans: FallbackSpan[], offset: number): [FallbackSpan[], FallbackSpan[]] {
  const before: FallbackSpan[] = [];
  const after: FallbackSpan[] = [];
  let pos = 0;
  let splitDone = false;

  for (const span of spans) {
    const end = pos + span.text.length;
    if (splitDone) {
      after.push({ text: span.text, marks: span.marks.map((m) => ({ ...m })) });
    } else if (offset <= pos) {
      splitDone = true;
      after.push({ text: span.text, marks: span.marks.map((m) => ({ ...m })) });
    } else if (offset >= end) {
      before.push({ text: span.text, marks: span.marks.map((m) => ({ ...m })) });
    } else {
      // Split inside this span
      before.push({ text: span.text.slice(0, offset - pos), marks: span.marks.map((m) => ({ ...m })) });
      after.push({ text: span.text.slice(offset - pos), marks: span.marks.map((m) => ({ ...m })) });
      splitDone = true;
    }
    pos = end;
  }
  return [before, after];
}

function applyInsertText(
  doc: FallbackDoc,
  step: { block_id: string; offset: number; text: string; marks: FallbackMark[] },
): void {
  const block = findBlockById(doc.blocks, step.block_id);
  if (!block) return;
  const spans = getRichTextSpans(block);
  const [before, after] = splitSpansAt(spans, step.offset);
  const newSpan: FallbackSpan = { text: step.text, marks: step.marks.map((m) => ({ ...m })) };
  setRichTextSpans(block, [...before, newSpan, ...after]);
}

function applyDeleteText(doc: FallbackDoc, step: { block_id: string; from: number; to: number }): void {
  const block = findBlockById(doc.blocks, step.block_id);
  if (!block) return;
  const spans = getRichTextSpans(block);
  const [beforeFrom] = splitSpansAt(spans, step.from);
  const [, afterTo] = splitSpansAt(spans, step.to);
  setRichTextSpans(block, [...beforeFrom, ...afterTo]);
}

function applyDeleteRange(doc: FallbackDoc, step: { block_id: string; from: number; to: number }): void {
  const block = findBlockById(doc.blocks, step.block_id);
  if (!block) return;
  // For Raw content (code blocks), delete directly from string
  if (block.content.type === "Raw") {
    const text = block.content.value;
    block.content = { type: "Raw", value: text.slice(0, step.from) + text.slice(step.to) };
    return;
  }
  // Fallback to RichText delete
  applyDeleteText(doc, step);
}

function applyAddMark(
  doc: FallbackDoc,
  step: { block_id: string; from: number; to: number; mark: FallbackMark },
): void {
  const block = findBlockById(doc.blocks, step.block_id);
  if (!block) return;
  const spans = getRichTextSpans(block);
  const [beforeFrom, rest] = splitSpansAt(spans, step.from);
  const totalLen = rest.reduce((sum, s) => sum + s.text.length, 0);
  const rangeLen = step.to - step.from;
  const [middle, afterTo] = splitSpansAt(rest, Math.min(rangeLen, totalLen));

  // Add the mark to every span in the range
  for (const span of middle) {
    if (!span.marks.some((m) => m.mark_type === step.mark.mark_type)) {
      span.marks.push({ mark_type: step.mark.mark_type, attrs: { ...step.mark.attrs } });
    }
  }

  setRichTextSpans(block, [...beforeFrom, ...middle, ...afterTo]);
}

function applyRemoveMark(
  doc: FallbackDoc,
  step: { block_id: string; from: number; to: number; mark_type: string },
): void {
  const block = findBlockById(doc.blocks, step.block_id);
  if (!block) return;
  const spans = getRichTextSpans(block);
  const [beforeFrom, rest] = splitSpansAt(spans, step.from);
  const totalLen = rest.reduce((sum, s) => sum + s.text.length, 0);
  const rangeLen = step.to - step.from;
  const [middle, afterTo] = splitSpansAt(rest, Math.min(rangeLen, totalLen));

  for (const span of middle) {
    span.marks = span.marks.filter((m) => m.mark_type !== step.mark_type);
  }

  setRichTextSpans(block, [...beforeFrom, ...middle, ...afterTo]);
}

function removeBlockById(blocks: FallbackBlock[], id: string): boolean {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.id === id) {
      blocks.splice(i, 1);
      return true;
    }
    if (removeBlockById(blocks[i]!.children, id)) return true;
  }
  return false;
}

function applyInsertBlock(
  doc: FallbackDoc,
  step: { parent_id: string | null; index: number; block: FallbackBlock },
): void {
  const target = step.parent_id ? findBlockById(doc.blocks, step.parent_id)?.children : doc.blocks;
  if (!target) return;
  target.splice(Math.min(step.index, target.length), 0, step.block);
}

function applyDeleteBlock(doc: FallbackDoc, step: { block_id: string }): void {
  removeBlockById(doc.blocks, step.block_id);
}

/** Block types that use Raw (string) content. */
const RAW_CONTENT_TYPES = new Set(["codeBlock"]);
/** Block types that use Empty content. */
const EMPTY_CONTENT_TYPES = new Set(["divider", "image", "columns", "column", "table", "tableRow"]);

function applySetBlockType(
  doc: FallbackDoc,
  step: { block_id: string; new_type: string; attrs: Record<string, unknown> },
): void {
  const block = findBlockById(doc.blocks, step.block_id);
  if (!block) return;

  const prevType = block.block_type;
  block.block_type = step.new_type;
  block.attrs = step.attrs;

  // Convert content type when switching between block categories
  if (RAW_CONTENT_TYPES.has(step.new_type) && block.content.type !== "Raw") {
    // RichText/Empty → Raw: join span texts into a plain string
    const text = block.content.type === "RichText"
      ? block.content.value.map((s) => s.text).join("")
      : "";
    block.content = { type: "Raw", value: text };
  } else if (EMPTY_CONTENT_TYPES.has(step.new_type) && block.content.type !== "Empty") {
    block.content = { type: "Empty" };
  } else if (
    !RAW_CONTENT_TYPES.has(step.new_type) &&
    !EMPTY_CONTENT_TYPES.has(step.new_type) &&
    block.content.type === "Raw"
  ) {
    // Raw → RichText: wrap string in a single span
    const text = block.content.value;
    block.content = { type: "RichText", value: text ? [{ text, marks: [] }] : [] };
  }
}

function applySetBlockAttrs(
  doc: FallbackDoc,
  step: { block_id: string; attrs: Record<string, unknown> },
): void {
  const block = findBlockById(doc.blocks, step.block_id);
  if (!block) return;
  Object.assign(block.attrs, step.attrs);
}

function applyMoveBlock(
  doc: FallbackDoc,
  step: { block_id: string; new_parent_id: string | null; new_index: number },
): void {
  // Remove from current location
  const block = findBlockById(doc.blocks, step.block_id);
  if (!block) return;
  const clone = JSON.parse(JSON.stringify(block)) as FallbackBlock;
  removeBlockById(doc.blocks, step.block_id);
  // Insert at new location
  const target = step.new_parent_id ? findBlockById(doc.blocks, step.new_parent_id)?.children : doc.blocks;
  if (!target) return;
  target.splice(Math.min(step.new_index, target.length), 0, clone);
}

function applySplitBlock(doc: FallbackDoc, step: { block_id: string; offset: number }): void {
  const block = findBlockById(doc.blocks, step.block_id);
  if (!block) return;
  const spans = getRichTextSpans(block);
  const [before, after] = splitSpansAt(spans, step.offset);

  // Find block in parent array
  const findInParent = (
    blocks: FallbackBlock[],
  ): { arr: FallbackBlock[]; idx: number } | null => {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i]!.id === step.block_id) return { arr: blocks, idx: i };
      const found = findInParent(blocks[i]!.children);
      if (found) return found;
    }
    return null;
  };

  const loc = findInParent(doc.blocks);
  if (!loc) return;

  setRichTextSpans(block, before);
  const newBlock: FallbackBlock = {
    id: crypto.randomUUID(),
    block_type: block.block_type === "heading" ? "paragraph" : block.block_type,
    attrs: block.block_type === "heading" ? {} : { ...block.attrs },
    content: { type: "RichText", value: normalizeSpans(after) },
    children: [],
  };
  loc.arr.splice(loc.idx + 1, 0, newBlock);
}

function applyMergeBlocks(doc: FallbackDoc, step: { block_id: string; target_id: string }): void {
  const source = findBlockById(doc.blocks, step.block_id);
  const target = findBlockById(doc.blocks, step.target_id);
  if (!source || !target) return;

  const targetSpans = getRichTextSpans(target);
  const sourceSpans = getRichTextSpans(source);
  setRichTextSpans(target, [...targetSpans, ...sourceSpans]);
  removeBlockById(doc.blocks, step.block_id);
}

// ---- Fallback HTML exporter ----

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function spansToHtml(spans: FallbackSpan[]): string {
  return spans.map((span) => {
    let html = escapeHtml(span.text);
    for (const mark of span.marks) {
      switch (mark.mark_type) {
        case "bold": html = `<strong>${html}</strong>`; break;
        case "italic": html = `<em>${html}</em>`; break;
        case "underline": html = `<u>${html}</u>`; break;
        case "strikethrough": html = `<s>${html}</s>`; break;
        case "code": html = `<code>${html}</code>`; break;
        case "superscript": html = `<sup>${html}</sup>`; break;
        case "subscript": html = `<sub>${html}</sub>`; break;
        case "link": {
          const href = escapeHtml(String(mark.attrs.href ?? ""));
          html = `<a href="${href}">${html}</a>`;
          break;
        }
        case "highlight": {
          const color = escapeHtml(String(mark.attrs.color ?? ""));
          html = color ? `<mark style="background:${color}">${html}</mark>` : `<mark>${html}</mark>`;
          break;
        }
      }
    }
    return html;
  }).join("");
}

function blockToHtml(block: FallbackBlock): string {
  const inner = block.content.type === "RichText"
    ? spansToHtml(block.content.value)
    : block.content.type === "Raw" ? escapeHtml(block.content.value) : "";
  const childrenHtml = block.children.map(blockToHtml).join("\n");

  switch (block.block_type) {
    case "paragraph": return `<p>${inner}</p>`;
    case "heading": {
      const level = Math.min(Math.max(Number(block.attrs.level) || 1, 1), 6);
      return `<h${level}>${inner}</h${level}>`;
    }
    case "bulletList": return `<ul>\n${childrenHtml}\n</ul>`;
    case "orderedList": return `<ol>\n${childrenHtml}\n</ol>`;
    case "listItem": return `<li>${inner}${childrenHtml ? `\n${childrenHtml}` : ""}</li>`;
    case "todoList": return `<ul class="todo-list">\n${childrenHtml}\n</ul>`;
    case "todoItem": {
      const checked = block.attrs.checked ? " checked" : "";
      return `<li><input type="checkbox"${checked} disabled> ${inner}</li>`;
    }
    case "codeBlock": {
      const lang = block.attrs.language ? ` class="language-${escapeHtml(String(block.attrs.language))}"` : "";
      return `<pre><code${lang}>${inner}</code></pre>`;
    }
    case "blockquote": return `<blockquote>${inner}${childrenHtml ? `\n${childrenHtml}` : ""}</blockquote>`;
    case "divider": return "<hr>";
    case "callout": {
      const emoji = block.attrs.emoji ? `<span class="callout-emoji">${escapeHtml(String(block.attrs.emoji))}</span>` : "";
      return `<div class="callout">${emoji}${inner}</div>`;
    }
    case "image": {
      const src = escapeHtml(String(block.attrs.src ?? ""));
      const alt = escapeHtml(String(block.attrs.alt ?? ""));
      const caption = block.attrs.caption ? `<figcaption>${escapeHtml(String(block.attrs.caption))}</figcaption>` : "";
      return `<figure><img src="${src}" alt="${alt}">${caption}</figure>`;
    }
    case "table": return `<table>\n${childrenHtml}\n</table>`;
    case "tableRow": return `<tr>\n${childrenHtml}\n</tr>`;
    case "tableHeader": return `<th>${inner}</th>`;
    case "tableCell": return `<td>${inner}</td>`;
    case "toggle": return `<details${block.attrs.open ? " open" : ""}><summary>${inner}</summary>\n${childrenHtml}\n</details>`;
    case "columns": return `<div class="columns">\n${childrenHtml}\n</div>`;
    case "column": return `<div class="column">\n${childrenHtml}\n</div>`;
    default: return inner ? `<p>${inner}</p>` : "";
  }
}

function fallbackExportHtml(docJson: string): string {
  const doc = JSON.parse(docJson) as FallbackDoc;
  return doc.blocks.map(blockToHtml).join("\n");
}

// ---- Fallback Markdown exporter ----

function spansToMarkdown(spans: FallbackSpan[]): string {
  return spans.map((span) => {
    let md = span.text;
    for (const mark of span.marks) {
      switch (mark.mark_type) {
        case "bold": md = `**${md}**`; break;
        case "italic": md = `*${md}*`; break;
        case "strikethrough": md = `~~${md}~~`; break;
        case "code": md = `\`${md}\``; break;
        case "link": md = `[${md}](${String(mark.attrs.href ?? "")})`; break;
        case "superscript": md = `<sup>${md}</sup>`; break;
        case "subscript": md = `<sub>${md}</sub>`; break;
        // underline and highlight have no standard markdown — use HTML
        case "underline": md = `<u>${md}</u>`; break;
        case "highlight": md = `<mark>${md}</mark>`; break;
      }
    }
    return md;
  }).join("");
}

function blockToMarkdown(block: FallbackBlock, indent = ""): string {
  const inner = block.content.type === "RichText"
    ? spansToMarkdown(block.content.value)
    : block.content.type === "Raw" ? block.content.value : "";

  switch (block.block_type) {
    case "paragraph": return inner ? `${indent}${inner}\n` : "\n";
    case "heading": {
      const level = Math.min(Math.max(Number(block.attrs.level) || 1, 1), 6);
      return `${"#".repeat(level)} ${inner}\n`;
    }
    case "bulletList":
      return block.children.map((child) => blockToMarkdown(child, indent)).join("");
    case "orderedList":
      return block.children.map((child, i) => {
        const num = `${i + 1}. `;
        const childMd = block.children.length > 0
          ? blockToMarkdown(child, indent).replace(/^- /, num)
          : `${indent}${num}\n`;
        return childMd;
      }).join("");
    case "listItem": {
      const childContent = block.children.map((c) => blockToMarkdown(c, indent + "  ")).join("");
      return `${indent}- ${inner}\n${childContent}`;
    }
    case "todoList":
      return block.children.map((child) => blockToMarkdown(child, indent)).join("");
    case "todoItem": {
      const check = block.attrs.checked ? "x" : " ";
      return `${indent}- [${check}] ${inner}\n`;
    }
    case "codeBlock": {
      const lang = block.attrs.language ? String(block.attrs.language) : "";
      return `\`\`\`${lang}\n${inner}\n\`\`\`\n`;
    }
    case "blockquote": {
      const childContent = block.children.map((c) => blockToMarkdown(c, "")).join("");
      const lines = (inner + (childContent ? "\n" + childContent : "")).split("\n").filter(Boolean);
      return lines.map((l) => `> ${l}`).join("\n") + "\n";
    }
    case "divider": return "---\n";
    case "callout": {
      const emoji = block.attrs.emoji ? `${block.attrs.emoji} ` : "";
      return `> ${emoji}${inner}\n`;
    }
    case "image": {
      const alt = String(block.attrs.alt ?? "");
      const src = String(block.attrs.src ?? "");
      const caption = block.attrs.caption ? `\n*${String(block.attrs.caption)}*` : "";
      return `![${alt}](${src})${caption}\n`;
    }
    case "table": {
      const rows = block.children;
      if (rows.length === 0) return "";
      const lines: string[] = [];
      for (let r = 0; r < rows.length; r++) {
        const cells = rows[r]!.children.map((cell) => {
          return cell.content.type === "RichText" ? spansToMarkdown(cell.content.value) : "";
        });
        lines.push(`| ${cells.join(" | ")} |`);
        if (r === 0) {
          lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
        }
      }
      return lines.join("\n") + "\n";
    }
    case "toggle": {
      const childContent = block.children.map((c) => blockToMarkdown(c, indent)).join("");
      return `<details>\n<summary>${inner}</summary>\n\n${childContent}\n</details>\n`;
    }
    case "columns":
    case "column":
      return block.children.map((c) => blockToMarkdown(c, indent)).join("");
    case "tableRow":
    case "tableHeader":
    case "tableCell":
      return inner;
    default: return inner ? `${indent}${inner}\n` : "";
  }
}

function fallbackExportMarkdown(docJson: string): string {
  const doc = JSON.parse(docJson) as FallbackDoc;
  return doc.blocks.map((b) => blockToMarkdown(b)).join("\n");
}

function fallbackApply(docJson: string, transactionJson: string): string {
  const doc = JSON.parse(docJson) as FallbackDoc;
  const tr = JSON.parse(transactionJson) as { steps: Record<string, unknown>[] };

  for (const step of tr.steps) {
    // Steps are externally-tagged: { "InsertText": { ... } }
    const tag = Object.keys(step)[0]!;
    const data = step[tag] as Record<string, unknown>;

    switch (tag) {
      case "InsertText":
        applyInsertText(doc, data as Parameters<typeof applyInsertText>[1]);
        break;
      case "DeleteText":
        applyDeleteText(doc, data as Parameters<typeof applyDeleteText>[1]);
        break;
      case "AddMark":
        applyAddMark(doc, data as Parameters<typeof applyAddMark>[1]);
        break;
      case "RemoveMark":
        applyRemoveMark(doc, data as Parameters<typeof applyRemoveMark>[1]);
        break;
      case "InsertBlock":
        applyInsertBlock(doc, data as Parameters<typeof applyInsertBlock>[1]);
        break;
      case "DeleteBlock":
        applyDeleteBlock(doc, data as Parameters<typeof applyDeleteBlock>[1]);
        break;
      case "SetBlockType":
        applySetBlockType(doc, data as Parameters<typeof applySetBlockType>[1]);
        break;
      case "SetBlockAttrs":
        applySetBlockAttrs(doc, data as Parameters<typeof applySetBlockAttrs>[1]);
        break;
      case "MoveBlock":
        applyMoveBlock(doc, data as Parameters<typeof applyMoveBlock>[1]);
        break;
      case "SplitBlock":
        applySplitBlock(doc, data as Parameters<typeof applySplitBlock>[1]);
        break;
      case "MergeBlocks":
        applyMergeBlocks(doc, data as Parameters<typeof applyMergeBlocks>[1]);
        break;
      case "DeleteRange":
        applyDeleteRange(doc, data as Parameters<typeof applyDeleteRange>[1]);
        break;
    }
  }

  return JSON.stringify(doc);
}

async function ensureInit(): Promise<typeof import("@gotipe/wasm")> {
  if (wasmModule) return wasmModule;
  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import("@gotipe/wasm");
      await mod.default();
      wasmModule = mod;
    })();
  }
  await initPromise;
  return wasmModule!;
}

export class WasmBridge {
  private editor: WasmEditor | null = null;
  private initialized = false;
  private fallbackMode = false;
  private fallbackState: string | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await ensureInit();
      this.initialized = true;
    } catch (e) {
      console.warn("GoTipe WASM init failed, using JS fallback:", e);
      this.fallbackMode = true;
      this.initialized = true;
    }
  }

  get isFallback(): boolean {
    return this.fallbackMode;
  }

  create(schemaJson: string, docJson: string): void {
    if (this.fallbackMode) {
      // Store the initial document as fallback state
      this.fallbackState = docJson;
      return;
    }
    const mod = wasmModule!;
    this.editor = new mod.WasmEditor(schemaJson, docJson);
  }

  apply(transactionJson: string): string {
    if (this.fallbackMode && this.fallbackState) {
      this.fallbackState = fallbackApply(this.fallbackState, transactionJson);
      return this.fallbackState;
    }
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "Editor not initialized");
    return this.editor.apply(transactionJson);
  }

  validate(_docJson: string): boolean {
    if (this.fallbackMode) return true;
    if (!this.editor) return true;
    return this.editor.validate(_docJson);
  }

  getState(): string {
    if (this.fallbackMode && this.fallbackState) {
      return this.fallbackState;
    }
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "Editor not initialized");
    return this.editor.export_json();
  }

  exportHtml(): string {
    if (this.fallbackMode && this.fallbackState) {
      return fallbackExportHtml(this.fallbackState);
    }
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.export_html();
  }

  exportMarkdown(): string {
    if (this.fallbackMode && this.fallbackState) {
      return fallbackExportMarkdown(this.fallbackState);
    }
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.export_markdown();
  }

  sanitizeHtml(html: string): string {
    if (this.fallbackMode) return html;
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.sanitize_html(html);
  }

  enableCollaboration(peerId: string): void {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    this.editor.enable_collaboration(peerId);
  }

  receiveUpdate(binary: Uint8Array): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.receive_update(binary);
  }

  getUpdate(): Uint8Array {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.get_update();
  }

  addComment(json: string): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.add_comment(json);
  }

  resolveComment(id: string): void {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    this.editor.resolve_comment(id);
  }

  getComments(): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.get_comments();
  }

  createVersion(name: string): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.create_version(name);
  }

  listVersions(): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.list_versions();
  }

  restoreVersion(id: string): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.restore_version(id);
  }

  detectPii(text: string): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.detect_pii(text);
  }

  restoreState(schemaJson: string, stateJson: string): void {
    if (this.fallbackMode) {
      this.fallbackState = stateJson;
      return;
    }
    if (!wasmModule) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "WASM module not loaded");
    this.editor = new wasmModule.WasmEditor(schemaJson, stateJson);
  }

  forceFallback(docJson: string): void {
    this.fallbackMode = true;
    this.fallbackState = docJson;
    this.editor = null;
  }

  destroy(): void {
    this.editor = null;
  }
}
