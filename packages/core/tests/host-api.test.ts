import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const wasmInit = vi.fn().mockRejectedValue(new Error('WASM must not load'));
vi.mock('@gotipe/wasm', () => ({
  default: wasmInit,
  WasmEditor: vi.fn().mockImplementation(() => {
    throw new Error('WASM must not load');
  }),
}));

import { createEditor as createDefaultEditor } from '../src/index';
import { type GoTipeEditor, GoTipeError, createEditor, toSafeHref } from '../src/js';
import { Bold } from '../src/extensions/marks';
import { History } from '../src/extensions/behaviors';
import { defineExtension } from '../src/types/extension';

const here = dirname(fileURLToPath(import.meta.url));

const Paragraph = defineExtension({
  name: 'paragraph',
  nodes: [
    { name: 'paragraph', group: ['block'], content: 'richText', attrs: {}, topLevel: true, marksAllowed: 'all', leaf: false, allowsChildren: false },
  ],
});

const DOC = {
  version: 1,
  blocks: [
    { id: 'a', type: 'paragraph', attrs: {}, content: [{ text: 'Hello world', marks: [] }], children: [] },
    { id: 'b', type: 'paragraph', attrs: {}, content: [{ text: 'Second', marks: [] }], children: [] },
  ],
};

function textOf(editor: GoTipeEditor, id: string): string {
  const block = editor.getViewState().blocks.find((b) => b.id === id);
  return Array.isArray(block?.content) ? block.content.map((s) => s.text).join('') : '';
}

/** Renders the view state the way @gotipe/react does (enough for DOM tests). */
function renderInto(root: HTMLElement, editor: GoTipeEditor) {
  root.innerHTML = '';
  for (const block of editor.getViewState().blocks) {
    const p = document.createElement('p');
    p.setAttribute('data-block-id', block.id);
    p.setAttribute('data-block-type', block.type);
    p.textContent = Array.isArray(block.content) ? block.content.map((s) => s.text).join('') : '';
    root.appendChild(p);
  }
}

describe('JS engine entry (@gotipe/core/js)', () => {
  it('runs without WASM and never calls the loader', async () => {
    const editor = await createEditor({ extensions: [Paragraph], content: DOC });
    expect(editor.engine).toBe('js');
    expect(wasmInit).not.toHaveBeenCalled();
    editor.dispatch({ steps: [{ type: 'insertText', blockId: 'a', offset: 5, text: ',', marks: [] }] });
    expect(textOf(editor, 'a')).toBe('Hello, world');
  });

  it('has no import path to @gotipe/wasm', () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from ["']@gotipe\/wasm["']|import\(["']@gotipe\/wasm["']\)/);
      expect(source, file).not.toMatch(/["']\.\/wasm-loader["']/);
      for (const m of source.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
        const spec = m[1]!;
        const base = resolve(dirname(file), spec);
        const candidates = [`${base}.ts`, `${base}/index.ts`];
        const target = candidates.find((c) => {
          try {
            readFileSync(c);
            return true;
          } catch {
            return false;
          }
        });
        if (target) visit(target);
      }
    };
    visit(resolve(here, '../src/js.ts'));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('rejects engine "wasm"', async () => {
    await expect(createEditor({ extensions: [Paragraph], engine: 'wasm' })).rejects.toMatchObject({
      code: 'WASM_INIT_FAILED',
    });
  });

  it('default entry with engine "js" skips the loader; "wasm" fails loudly', async () => {
    const editor = await createDefaultEditor({ extensions: [Paragraph], engine: 'js' });
    expect(editor.engine).toBe('js');
    expect(wasmInit).not.toHaveBeenCalled();
    await expect(createDefaultEditor({ extensions: [Paragraph], engine: 'wasm' })).rejects.toBeInstanceOf(GoTipeError);
  });
});

describe('host API', () => {
  it('routes links through host.openLink and blocks unsafe schemes', async () => {
    const openLink = vi.fn();
    const onError = vi.fn();
    const editor = await createEditor({ extensions: [Paragraph], content: DOC, host: { openLink, onError } });
    const errors: GoTipeError[] = [];
    editor.on('error', (e) => errors.push(e));
    editor.openLink('https://example.com/a', { blockId: 'a' });
    expect(openLink).toHaveBeenCalledWith('https://example.com/a', { blockId: 'a', newTab: true, target: null });
    editor.openLink('docs/pages/other.md');
    expect(openLink).toHaveBeenLastCalledWith('docs/pages/other.md', { blockId: null, newTab: true, target: null });
    editor.openLink('javascript:alert(1)');
    editor.openLink(' JaVa\tScRiPt:alert(1)');
    expect(openLink).toHaveBeenCalledTimes(2);
    expect(errors.map((e) => e.code)).toEqual(['LINK_BLOCKED', 'LINK_BLOCKED']);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('toSafeHref keeps http(s), mailto and relative references only', () => {
    expect(toSafeHref('https://a.b')).toBe('https://a.b');
    expect(toSafeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(toSafeHref('#section')).toBe('#section');
    expect(toSafeHref('assets/x.png')).toBe('assets/x.png');
    expect(toSafeHref('data:text/html,<b>')).toBeNull();
    expect(toSafeHref('file:///etc/passwd')).toBeNull();
    expect(toSafeHref('')).toBeNull();
  });

  it('clicking a link while editing does not open it; Cmd/Ctrl+click and read-only do', async () => {
    const openLink = vi.fn();
    const editor = await createEditor({ extensions: [Paragraph], content: DOC, host: { openLink } });
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = '<p data-block-id="a" data-block-type="paragraph"><a href="https://x.y">x</a></p>';
    editor.mount(root);
    const a = root.querySelector('a')!;
    const click = (init: MouseEventInit) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
      a.dispatchEvent(event);
      return event;
    };
    expect(click({}).defaultPrevented).toBe(true);
    expect(openLink).not.toHaveBeenCalled();
    click({ ctrlKey: true });
    expect(openLink).toHaveBeenCalledTimes(1);
    editor.setEditable(false);
    click({});
    expect(openLink).toHaveBeenCalledTimes(2);
    editor.destroy();
    root.remove();
  });
});

describe('read-only mode', () => {
  it('toggles contenteditable and ignores input', async () => {
    const editor = await createEditor({ extensions: [Paragraph], content: DOC });
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderInto(root, editor);
    editor.mount(root);
    const changes: boolean[] = [];
    editor.on('editableChange', (v) => changes.push(v));
    editor.setEditable(false);
    expect(editor.isEditable).toBe(false);
    expect(root.getAttribute('contenteditable')).toBe('false');
    expect(root.getAttribute('aria-readonly')).toBe('true');
    const spy = vi.spyOn(editor, 'dispatch');
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    editor.setEditable(true);
    expect(root.getAttribute('contenteditable')).toBe('true');
    expect(changes).toEqual([false, true]);
    editor.destroy();
    root.remove();
  });
});

describe('decorations', () => {
  it('attaches layers to blocks without touching the document', async () => {
    const editor = await createEditor({ extensions: [Paragraph], content: DOC });
    const json = JSON.stringify(editor.getJSON());
    editor.setDecorations('review', [
      { type: 'inline', key: 'p1', blockId: 'a', from: 0, to: 5, className: 'x' },
      { type: 'widget', key: 'p1w', blockId: 'b', offset: 6, text: '!' },
    ]);
    const blocks = editor.getViewState().blocks;
    expect(blocks[0]!.decorations).toHaveLength(1);
    expect(blocks[1]!.decorations[0]).toMatchObject({ type: 'widget', text: '!' });
    expect(JSON.stringify(editor.getJSON())).toBe(json);
    editor.setDecorations('review', []);
    expect(editor.getViewState().blocks[0]!.decorations).toHaveLength(0);
  });

  it('keeps object identity of untouched blocks across edits', async () => {
    const editor = await createEditor({ extensions: [Paragraph], content: DOC });
    const before = editor.getViewState().blocks;
    editor.dispatch({ steps: [{ type: 'insertText', blockId: 'a', offset: 0, text: '>', marks: [] }] });
    const after = editor.getViewState().blocks;
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });
});

describe('external replacement', () => {
  it('preserves selection by block id and clamps the offset', async () => {
    const editor = await createEditor({ extensions: [Paragraph], content: DOC });
    editor.setSelection({ anchor: { blockId: 'b', offset: 6 }, head: { blockId: 'b', offset: 6 } });
    editor.setContent(
      {
        version: 1,
        blocks: [
          { id: 'a', type: 'paragraph', attrs: {}, content: [{ text: 'Changed by the model', marks: [] }], children: [] },
          { id: 'b', type: 'paragraph', attrs: {}, content: [{ text: 'Sec', marks: [] }], children: [] },
        ],
      },
      { preserveSelection: true },
    );
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: 'b', offset: 3 });
  });

  it('falls back to the block at the same position when ids change', async () => {
    const editor = await createEditor({ extensions: [Paragraph], content: DOC });
    editor.setSelection({ anchor: { blockId: 'b', offset: 2 }, head: { blockId: 'b', offset: 2 } });
    editor.setContent(
      {
        version: 1,
        blocks: [
          { id: 'x', type: 'paragraph', attrs: {}, content: [{ text: 'One', marks: [] }], children: [] },
          { id: 'y', type: 'paragraph', attrs: {}, content: [{ text: 'Two', marks: [] }], children: [] },
        ],
      },
      { preserveSelection: true, addToHistory: true },
    );
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: 'y', offset: 2 });
    expect(editor.undo()).toBe(true);
    expect(textOf(editor, 'b')).toBe('Second');
  });

  it('does not move focus into the editor', async () => {
    const editor = await createEditor({ extensions: [Paragraph], content: DOC });
    const root = document.createElement('div');
    const input = document.createElement('input');
    document.body.append(root, input);
    renderInto(root, editor);
    editor.mount(root);
    input.focus();
    editor.setContent(DOC, { preserveSelection: true });
    expect(document.activeElement).toBe(input);
    editor.destroy();
    root.remove();
    input.remove();
  });
});

describe('keyboard', () => {
  it('matches shortcuts by physical key on non-Latin layouts', async () => {
    const editor = await createEditor({ extensions: [Paragraph, Bold, History], content: DOC });
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderInto(root, editor);
    editor.mount(root);
    editor.setSelection({ anchor: { blockId: 'a', offset: 0 }, head: { blockId: 'a', offset: 5 } });
    // Russian layout: Ctrl+B reports key "и", code "KeyB".
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'и', code: 'KeyB', ctrlKey: true, bubbles: true, cancelable: true }));
    const span = editor.getViewState().blocks[0]!.content as { text: string; marks: { type: string }[] }[];
    expect(span[0]).toMatchObject({ text: 'Hello', marks: [{ type: 'bold' }] });
    // Ctrl+Z (key "я") undoes.
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'я', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
    expect((editor.getViewState().blocks[0]!.content as { marks: unknown[] }[])[0]!.marks).toEqual([]);
    editor.destroy();
    root.remove();
  });
});

describe('IME composition', () => {
  it('commits the composed text once, from the DOM', async () => {
    const editor = await createEditor({ extensions: [Paragraph], content: DOC });
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderInto(root, editor);
    editor.mount(root);
    const textNode = root.querySelector('[data-block-id="b"]')!.firstChild as Text;
    const sel = document.getSelection()!;
    sel.collapse(textNode, 6);
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    // The browser renders intermediate composition text itself…
    const mid = new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'か', bubbles: true, cancelable: true });
    root.dispatchEvent(mid);
    expect(mid.defaultPrevented).toBe(false);
    textNode.nodeValue = 'Secondか';
    textNode.nodeValue = 'Second漢字';
    root.dispatchEvent(new CompositionEvent('compositionend', { data: '漢字', bubbles: true }));
    expect(textOf(editor, 'b')).toBe('Second漢字');
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: 'b', offset: 8 });
    editor.destroy();
    root.remove();
  });

  it('handles dead keys replacing a character (é)', async () => {
    const editor = await createEditor({ extensions: [Paragraph], content: DOC });
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderInto(root, editor);
    editor.mount(root);
    const textNode = root.querySelector('[data-block-id="a"]')!.firstChild as Text;
    document.getSelection()!.collapse(textNode, 5);
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    textNode.nodeValue = 'Hello´ world';
    textNode.nodeValue = 'Helloé world';
    root.dispatchEvent(new CompositionEvent('compositionend', { data: 'é', bubbles: true }));
    expect(textOf(editor, 'a')).toBe('Helloé world');
    editor.destroy();
    root.remove();
  });
});

it('keeps adapter composition lifecycle observers separate from application error handling', async () => {
  const editor = await createEditor({ extensions: [Paragraph], content: DOC });
  const lifecycle = vi.fn();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = new GoTipeError('COMPOSITION_CONFLICT', 'Recover input', { text: 'Ж😀' });
  try {
    editor.on('compositionInterrupted', lifecycle);
    editor.reportError(failure);
    expect(lifecycle).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledExactlyOnceWith(failure);
    const application = vi.fn();
    editor.on('error', application);
    editor.reportError(failure);
    expect(application).toHaveBeenCalledExactlyOnceWith(failure);
    expect(log).toHaveBeenCalledOnce();
  } finally {
    log.mockRestore();
    editor.destroy();
  }
});
