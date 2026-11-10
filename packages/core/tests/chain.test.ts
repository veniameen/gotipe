import { describe, it, expect, vi } from 'vitest';

import { createEditor } from '../src/js';
import { Paragraph } from '../src/extensions/paragraph';
import { Heading } from '../src/extensions/heading';
import { Bold, Italic } from '../src/extensions/marks';

const extensions = [Paragraph, Heading, Bold, Italic];

describe('ChainableCommands', () => {
  it('should support fluent API', async () => {
    const editor = await createEditor({ extensions });
    const chain = editor.chain();
    expect(chain.toggleBold()).toBe(chain);
    expect(chain.toggleItalic()).toBe(chain);
  });

  it('should dispatch on run()', async () => {
    const editor = await createEditor({ extensions });
    const dispatchSpy = vi.spyOn(editor, 'dispatch');
    editor.chain().toggleBold().run();
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('should return false when no steps queued', async () => {
    const editor = await createEditor({ extensions });
    const result = editor.chain().run();
    expect(result).toBe(false);
  });

  it('should chain multiple operations', async () => {
    const editor = await createEditor({ extensions });
    const dispatchSpy = vi.spyOn(editor, 'dispatch');
    editor.chain().toggleBold().toggleItalic().run();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const call = dispatchSpy.mock.calls[0][0] as { steps: unknown[] };
    expect(call.steps.length).toBe(2);
  });

  it('should set block type', async () => {
    const editor = await createEditor({ extensions });
    const first = editor.getViewState().blocks[0]!;
    editor.setSelection({ anchor: { blockId: first.id, offset: 0 }, head: { blockId: first.id, offset: 0 } });
    const dispatchSpy = vi.spyOn(editor, 'dispatch');
    editor.chain().setBlockType('heading', { level: 2 }).run();
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('should insert text', async () => {
    const editor = await createEditor({ extensions });
    const dispatchSpy = vi.spyOn(editor, 'dispatch');
    editor.chain().insertText('Hello').run();
    expect(dispatchSpy).toHaveBeenCalled();
  });
});
