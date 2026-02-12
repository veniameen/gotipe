import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gotipe/wasm', () => {
  const mockEditor = {
    apply: vi.fn().mockReturnValue('{}'),
    validate: vi.fn().mockReturnValue(true),
    export_json: vi.fn().mockReturnValue(
      JSON.stringify({
        blocks: [
          { id: 'block-1', type: 'paragraph', attrs: {}, content: [{ text: 'Test', marks: [] }], children: [], decorations: [] },
        ],
        selection: { type: 'text', anchor: { blockId: 'block-1', offset: 0 }, head: { blockId: 'block-1', offset: 4 } },
        decorations: [],
        toolbar: { activeMarks: [], activeBlockType: 'paragraph', activeBlockAttrs: {}, canUndo: false, canRedo: false },
        version: 1,
      }),
    ),
    export_html: vi.fn().mockReturnValue('<p>Test</p>'),
    export_markdown: vi.fn().mockReturnValue('Test'),
    sanitize_html: vi.fn((h: string) => h),
    enable_collaboration: vi.fn(),
    receive_update: vi.fn().mockReturnValue('{}'),
    get_update: vi.fn().mockReturnValue(new Uint8Array()),
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
    WasmEditor: vi.fn().mockImplementation(() => mockEditor),
  };
});

import { createEditor } from '../src/editor';
import { defineExtension } from '../src/types/extension';

const testExt = defineExtension({
  name: 'paragraph',
  nodes: [
    { name: 'paragraph', group: ['block'], content: 'richText', attrs: {}, topLevel: true, marksAllowed: 'all', leaf: false, allowsChildren: false },
  ],
});

describe('ChainableCommands', () => {
  it('should support fluent API', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    const chain = editor.chain();
    expect(chain.toggleBold()).toBe(chain);
    expect(chain.toggleItalic()).toBe(chain);
  });

  it('should dispatch on run()', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    const dispatchSpy = vi.spyOn(editor, 'dispatch');
    editor.chain().toggleBold().run();
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('should return false when no steps queued', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    const result = editor.chain().run();
    expect(result).toBe(false);
  });

  it('should chain multiple operations', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    const dispatchSpy = vi.spyOn(editor, 'dispatch');
    editor.chain().toggleBold().toggleItalic().run();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const call = dispatchSpy.mock.calls[0][0] as { steps: unknown[] };
    expect(call.steps.length).toBe(2);
  });

  it('should set block type', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    const dispatchSpy = vi.spyOn(editor, 'dispatch');
    editor.chain().setBlockType('heading', { level: 2 }).run();
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('should insert text', async () => {
    const editor = await createEditor({ extensions: [testExt] });
    const dispatchSpy = vi.spyOn(editor, 'dispatch');
    editor.chain().insertText('Hello').run();
    expect(dispatchSpy).toHaveBeenCalled();
  });
});
