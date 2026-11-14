import { describe, it, expect, vi } from 'vitest';

// Mock WASM module
vi.mock('@gotipe/wasm', () => {
  const mockEditor = {
    apply: vi.fn().mockReturnValue('{}'),
    validate: vi.fn().mockReturnValue(true),
    export_json: vi.fn().mockReturnValue(
      JSON.stringify({
        blocks: [
          {
            id: 'block-1',
            type: 'paragraph',
            attrs: {},
            content: [{ text: 'Hello world', marks: [] }],
            children: [],
            decorations: [],
          },
        ],
        selection: { type: 'text', anchor: { blockId: 'block-1', offset: 0 }, head: { blockId: 'block-1', offset: 0 } },
        decorations: [],
        toolbar: { activeMarks: [], activeBlockType: 'paragraph', activeBlockAttrs: {}, canUndo: false, canRedo: false },
        version: 1,
      }),
    ),
    enable_collaboration: vi.fn(),
    receive_update: vi.fn().mockReturnValue('{}'),
    get_update: vi.fn().mockReturnValue(new Uint8Array()),
    get_local_update_after: vi.fn().mockReturnValue(new Uint8Array()),
    get_update_missing_from: vi.fn().mockReturnValue(new Uint8Array()),
    add_comment: vi.fn().mockReturnValue('{}'),
    resolve_comment: vi.fn(),
    get_comments: vi.fn().mockReturnValue('[]'),
    create_version: vi.fn().mockReturnValue('{}'),
    list_versions: vi.fn().mockReturnValue('[]'),
    restore_version: vi.fn().mockReturnValue('{}'),
    detect_pii: vi.fn().mockReturnValue('[]'),
  };

  return {
    default: vi.fn().mockResolvedValue(undefined),
    WasmEditor: vi.fn().mockImplementation(function () { return mockEditor; }),
  };
});

import { createEditor } from '../src/index';
import { defineExtension } from '../src/types/extension';

const testExt = defineExtension({
  name: 'paragraph',
  nodes: [
    {
      name: 'paragraph',
      group: ['block'],
      content: 'richText',
      attrs: {},
      topLevel: true,
      marksAllowed: 'all',
      leaf: false,
      allowsChildren: false,
    },
  ],
});

describe('createEditor', () => {
  it('should create an editor instance', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    expect(editor).toBeDefined();
    expect(editor.isDestroyed).toBe(false);
  });

  it('should return ViewState', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    const state = editor.getViewState();
    expect(state.blocks).toBeDefined();
    expect(state.selection).toBeDefined();
    expect(state.toolbar).toBeDefined();
  });

  it('should emit create event', async () => {
    const onCreate = vi.fn();
    await createEditor({ extensions: [testExt], onCreate });
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('should emit destroy event', async () => {
    const onDestroy = vi.fn();
    const editor = await createEditor({ extensions: [testExt], onDestroy });
    editor.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(editor.isDestroyed).toBe(true);
  });

  it('should register and fire events', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    const handler = vi.fn();
    const unsub = editor.on('update', handler);
    editor.emit('update', { editor });
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
    editor.emit('update', { editor });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should get HTML', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    expect(editor.getHTML()).toBe('<p>Hello world</p>');
  });

  it('should get Markdown', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    expect(editor.getMarkdown()).toBe('Hello world\n');
  });

  it('should get plain text', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    expect(editor.getText()).toBe('Hello world');
  });

  it('should detect empty editor', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    // Not empty since mock returns content
    expect(editor.isEmpty()).toBe(false);
  });

  it('should get current block', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    editor.setSelection({ anchor: { blockId: 'block-1', offset: 0 }, head: { blockId: 'block-1', offset: 0 } });
    const block = editor.getCurrentBlock();
    expect(block).toBeDefined();
    expect(block?.type).toBe('paragraph');
  });
});
