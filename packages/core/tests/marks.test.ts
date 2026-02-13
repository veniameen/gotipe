import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock WASM to force fallback mode — the WasmEditor constructor throws,
// so the editor falls back to the JS transform engine.
vi.mock('@gotipe/wasm', () => {
  return {
    default: vi.fn().mockRejectedValue(new Error('WASM not available')),
    WasmEditor: vi.fn().mockImplementation(() => {
      throw new Error('WASM not available');
    }),
  };
});

import { createEditor, type GoTipeEditor } from '../src/editor';
import { Bold, Italic, Underline, Strikethrough, InlineCode, Highlight, Superscript, Subscript, Link } from '../src/extensions/marks';
import { defineExtension } from '../src/types/extension';

const Paragraph = defineExtension({
  name: 'paragraph',
  nodes: [
    { name: 'paragraph', group: ['block'], content: 'richText', attrs: {}, topLevel: true, marksAllowed: 'all', leaf: false, allowsChildren: false },
  ],
});

const CONTENT_WITH_BOLD = {
  version: 1,
  blocks: [
    {
      id: 'b1',
      type: 'paragraph',
      attrs: {},
      content: [
        { text: 'Hello ', marks: [] },
        { text: 'bold', marks: [{ type: 'bold' }] },
        { text: ' world', marks: [] },
      ],
      children: [],
    },
  ],
};

const PLAIN_CONTENT = {
  version: 1,
  blocks: [
    {
      id: 'p1',
      type: 'paragraph',
      attrs: {},
      content: [
        { text: 'Hello world', marks: [] },
      ],
      children: [],
    },
  ],
};

function getBlock(editor: GoTipeEditor, blockId: string) {
  const state = editor.getViewState();
  return state.blocks.find((b) => b.id === blockId);
}

function getSpans(editor: GoTipeEditor, blockId: string) {
  const block = getBlock(editor, blockId);
  return Array.isArray(block?.content) ? block.content : [];
}

function getPlainText(editor: GoTipeEditor, blockId: string) {
  return getSpans(editor, blockId).map((s) => s.text).join('');
}

// Simulate setting the internal selection via dispatch pattern
// Since we can't set currentSelection directly, we use the public API
// by dispatching a selection-aware transaction
function setSelection(editor: GoTipeEditor, blockId: string, anchorOffset: number, headOffset?: number) {
  // Access internals: getViewState uses currentSelection
  // We need to simulate it by dispatching a no-op that changes selection context
  // Actually, chain() reads from getViewState().selection which defaults to currentSelection
  // We can work around by dispatching insertText/deleteText to position the cursor

  // Hack: directly mutate internal state via the editor object
  // Since currentSelection is closure-scoped, use type assertion + known property
  // Actually we can't access it. Let's think of another approach.

  // The approach: dispatch a transaction with steps that target the right block.
  // chain().toggleMark reads selection from getViewState().
  // getViewState() uses `currentSelection` which defaults to { blockId: '', offset: 0 }.
  //
  // For testing, we need to simulate the selection. The simplest approach is to
  // build the transaction steps manually with explicit from/to values.

  // We'll use dispatch() directly with explicit step parameters instead of chain().
}

describe('Marks — JS Fallback Engine', () => {
  describe('AddMark on range selection', () => {
    it('should add bold mark to plain text range', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: PLAIN_CONTENT,
      });

      // Dispatch addMark directly with explicit range
      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 0,
          to: 5,
          mark: { type: 'bold' },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(getPlainText(editor, 'p1')).toBe('Hello world');
      // "Hello" should be bold, " world" should not
      expect(spans.length).toBe(2);
      expect(spans[0].text).toBe('Hello');
      expect(spans[0].marks).toEqual([{ type: 'bold' }]);
      expect(spans[1].text).toBe(' world');
      expect(spans[1].marks).toEqual([]);
    });

    it('should add italic mark to a range', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Italic],
        content: PLAIN_CONTENT,
      });

      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 6,
          to: 11,
          mark: { type: 'italic' },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(getPlainText(editor, 'p1')).toBe('Hello world');
      expect(spans.length).toBe(2);
      expect(spans[0].text).toBe('Hello ');
      expect(spans[0].marks).toEqual([]);
      expect(spans[1].text).toBe('world');
      expect(spans[1].marks).toEqual([{ type: 'italic' }]);
    });

    it('should add underline mark', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Underline],
        content: PLAIN_CONTENT,
      });

      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 0,
          to: 11,
          mark: { type: 'underline' },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans.length).toBe(1);
      expect(spans[0].text).toBe('Hello world');
      expect(spans[0].marks).toEqual([{ type: 'underline' }]);
    });

    it('should add strikethrough mark', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Strikethrough],
        content: PLAIN_CONTENT,
      });

      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 0,
          to: 5,
          mark: { type: 'strikethrough' },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans[0].text).toBe('Hello');
      expect(spans[0].marks).toEqual([{ type: 'strikethrough' }]);
    });

    it('should add code mark', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, InlineCode],
        content: PLAIN_CONTENT,
      });

      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 6,
          to: 11,
          mark: { type: 'code' },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans.length).toBe(2);
      expect(spans[1].text).toBe('world');
      expect(spans[1].marks).toEqual([{ type: 'code' }]);
    });

    it('should add highlight mark with color attr', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Highlight],
        content: PLAIN_CONTENT,
      });

      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 0,
          to: 5,
          mark: { type: 'highlight', attrs: { color: 'yellow' } },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans[0].text).toBe('Hello');
      expect(spans[0].marks[0].type).toBe('highlight');
    });

    it('should add link mark with href attr', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Link],
        content: PLAIN_CONTENT,
      });

      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 6,
          to: 11,
          mark: { type: 'link', attrs: { href: 'https://example.com', target: '_blank' } },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans[1].text).toBe('world');
      expect(spans[1].marks[0].type).toBe('link');
    });

    it('should add superscript mark', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Superscript],
        content: PLAIN_CONTENT,
      });

      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 0,
          to: 5,
          mark: { type: 'superscript' },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans[0].marks).toEqual([{ type: 'superscript' }]);
    });

    it('should add subscript mark', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Subscript],
        content: PLAIN_CONTENT,
      });

      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 0,
          to: 5,
          mark: { type: 'subscript' },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans[0].marks).toEqual([{ type: 'subscript' }]);
    });
  });

  describe('RemoveMark on range selection', () => {
    it('should remove bold from already-bold text', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: CONTENT_WITH_BOLD,
      });

      // Initially "bold" (offset 6-10) is bold
      let spans = getSpans(editor, 'b1');
      expect(spans[1].text).toBe('bold');
      expect(spans[1].marks).toEqual([{ type: 'bold' }]);

      // Remove bold from range 6-10
      editor.dispatch({
        steps: [{
          type: 'removeMark',
          blockId: 'b1',
          from: 6,
          to: 10,
          markType: 'bold',
        }],
      });

      spans = getSpans(editor, 'b1');
      // All spans should now have no marks, and adjacent spans should be normalized
      expect(getPlainText(editor, 'b1')).toBe('Hello bold world');
      expect(spans.length).toBe(1);
      expect(spans[0].marks).toEqual([]);
    });

    it('should remove bold from partial range', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: CONTENT_WITH_BOLD,
      });

      // Remove bold from offset 6-8 (only "bo" out of "bold")
      editor.dispatch({
        steps: [{
          type: 'removeMark',
          blockId: 'b1',
          from: 6,
          to: 8,
          markType: 'bold',
        }],
      });

      const spans = getSpans(editor, 'b1');
      expect(getPlainText(editor, 'b1')).toBe('Hello bold world');
      // "Hello " + "bo" (no marks) + "ld" (bold) + " world"
      // After normalize: "Hello bo" (no marks) + "ld" (bold) + " world" (no marks)
      expect(spans.length).toBe(3);
      expect(spans[0].text).toBe('Hello bo');
      expect(spans[0].marks).toEqual([]);
      expect(spans[1].text).toBe('ld');
      expect(spans[1].marks).toEqual([{ type: 'bold' }]);
      expect(spans[2].text).toBe(' world');
      expect(spans[2].marks).toEqual([]);
    });
  });

  describe('Multiple marks on same text', () => {
    it('should stack bold and italic on same range', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold, Italic],
        content: PLAIN_CONTENT,
      });

      // Add bold to 0-5
      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 0,
          to: 5,
          mark: { type: 'bold' },
        }],
      });

      // Add italic to same range
      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 0,
          to: 5,
          mark: { type: 'italic' },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans[0].text).toBe('Hello');
      expect(spans[0].marks.length).toBe(2);
      expect(spans[0].marks.map((m) => m.type).sort()).toEqual(['bold', 'italic']);
    });

    it('should remove only one mark when both are present', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold, Italic],
        content: PLAIN_CONTENT,
      });

      // Add bold + italic
      editor.dispatch({
        steps: [
          { type: 'addMark', blockId: 'p1', from: 0, to: 5, mark: { type: 'bold' } },
          { type: 'addMark', blockId: 'p1', from: 0, to: 5, mark: { type: 'italic' } },
        ],
      });

      // Remove only bold
      editor.dispatch({
        steps: [{
          type: 'removeMark',
          blockId: 'p1',
          from: 0,
          to: 5,
          markType: 'bold',
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans[0].text).toBe('Hello');
      expect(spans[0].marks.length).toBe(1);
      expect(spans[0].marks[0].type).toBe('italic');
    });
  });

  describe('InsertText with marks', () => {
    it('should insert text with bold mark', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: PLAIN_CONTENT,
      });

      editor.dispatch({
        steps: [{
          type: 'insertText',
          blockId: 'p1',
          offset: 5,
          text: ' BOLD',
          marks: [{ type: 'bold' }],
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(getPlainText(editor, 'p1')).toBe('Hello BOLD world');
      // "Hello" (no marks) + " BOLD" (bold) + " world" (no marks)
      expect(spans.length).toBe(3);
      expect(spans[1].text).toBe(' BOLD');
      expect(spans[1].marks).toEqual([{ type: 'bold' }]);
    });

    it('should insert text with no marks into marked region', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: CONTENT_WITH_BOLD,
      });

      // Insert plain text into the middle of the bold word "bold" (at offset 8, between "bo" and "ld")
      editor.dispatch({
        steps: [{
          type: 'insertText',
          blockId: 'b1',
          offset: 8,
          text: 'XX',
          marks: [],
        }],
      });

      const spans = getSpans(editor, 'b1');
      expect(getPlainText(editor, 'b1')).toBe('Hello boXXld world');
    });
  });

  describe('DeleteText preserves marks', () => {
    it('should delete text and preserve surrounding marks', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: CONTENT_WITH_BOLD,
      });

      // Delete the space before "bold" (offset 5-6)
      editor.dispatch({
        steps: [{
          type: 'deleteText',
          blockId: 'b1',
          from: 5,
          to: 6,
        }],
      });

      const spans = getSpans(editor, 'b1');
      expect(getPlainText(editor, 'b1')).toBe('Hellobold world');
      // "Hello" and "bold" should still have their marks
      expect(spans[0].text).toBe('Hello');
      expect(spans[0].marks).toEqual([]);
      expect(spans[1].text).toBe('bold');
      expect(spans[1].marks).toEqual([{ type: 'bold' }]);
    });

    it('should delete within a marked range', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: CONTENT_WITH_BOLD,
      });

      // Delete "ol" from "bold" (offset 7-9)
      editor.dispatch({
        steps: [{
          type: 'deleteText',
          blockId: 'b1',
          from: 7,
          to: 9,
        }],
      });

      const spans = getSpans(editor, 'b1');
      expect(getPlainText(editor, 'b1')).toBe('Hello bd world');
      // "bd" should still be bold
      const boldSpan = spans.find((s) => s.marks.length > 0);
      expect(boldSpan?.text).toBe('bd');
      expect(boldSpan?.marks).toEqual([{ type: 'bold' }]);
    });
  });

  describe('Stored marks (collapsed selection toggle)', () => {
    it('should handle stored marks toggle for collapsed selection', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: PLAIN_CONTENT,
      });

      // Dispatch addMark with from === to (collapsed selection) → triggers stored marks
      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 5,
          to: 5,
          mark: { type: 'bold' },
        }],
      });

      // After stored mark toggle, activeMarks should include bold
      const state = editor.getViewState();
      expect(state.toolbar.activeMarks).toContain('bold');
    });

    it('should toggle stored marks off', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: PLAIN_CONTENT,
      });

      // Toggle bold on (stored)
      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 5,
          to: 5,
          mark: { type: 'bold' },
        }],
      });
      expect(editor.getViewState().toolbar.activeMarks).toContain('bold');

      // Toggle bold off (stored)
      editor.dispatch({
        steps: [{
          type: 'removeMark',
          blockId: 'p1',
          from: 5,
          to: 5,
          markType: 'bold',
        }],
      });
      expect(editor.getViewState().toolbar.activeMarks).not.toContain('bold');
    });
  });

  describe('SplitBlock preserves marks', () => {
    it('should split block and preserve marks on both halves', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: CONTENT_WITH_BOLD,
      });

      // Split inside the bold text at offset 8 (between "bo" and "ld")
      editor.dispatch({
        steps: [{
          type: 'splitBlock',
          blockId: 'b1',
          offset: 8,
        }],
      });

      const state = editor.getViewState();
      expect(state.blocks.length).toBe(2);

      // First block: "Hello " + "bo" (bold)
      const firstSpans = Array.isArray(state.blocks[0].content) ? state.blocks[0].content : [];
      expect(firstSpans.map((s) => s.text).join('')).toBe('Hello bo');

      // Second block: "ld" (bold) + " world"
      const secondSpans = Array.isArray(state.blocks[1].content) ? state.blocks[1].content : [];
      expect(secondSpans.map((s) => s.text).join('')).toBe('ld world');
    });
  });

  describe('MergeBlocks preserves marks', () => {
    it('should merge blocks and combine spans with marks', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold, Italic],
        content: {
          version: 1,
          blocks: [
            {
              id: 'm1',
              type: 'paragraph',
              attrs: {},
              content: [{ text: 'First', marks: [{ type: 'bold' }] }],
              children: [],
            },
            {
              id: 'm2',
              type: 'paragraph',
              attrs: {},
              content: [{ text: 'Second', marks: [{ type: 'italic' }] }],
              children: [],
            },
          ],
        },
      });

      // Merge m2 into m1
      editor.dispatch({
        steps: [{
          type: 'mergeBlocks',
          blockId: 'm2',
          targetId: 'm1',
        }],
      });

      const state = editor.getViewState();
      expect(state.blocks.length).toBe(1);
      const spans = Array.isArray(state.blocks[0].content) ? state.blocks[0].content : [];
      expect(spans.length).toBe(2);
      expect(spans[0].text).toBe('First');
      expect(spans[0].marks).toEqual([{ type: 'bold' }]);
      expect(spans[1].text).toBe('Second');
      expect(spans[1].marks).toEqual([{ type: 'italic' }]);
    });
  });

  describe('Overlapping mark ranges', () => {
    it('should handle overlapping bold and italic ranges', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold, Italic],
        content: PLAIN_CONTENT,
      });

      // Bold 0-7 ("Hello w")
      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 0,
          to: 7,
          mark: { type: 'bold' },
        }],
      });

      // Italic 4-11 ("o world")
      editor.dispatch({
        steps: [{
          type: 'addMark',
          blockId: 'p1',
          from: 4,
          to: 11,
          mark: { type: 'italic' },
        }],
      });

      const spans = getSpans(editor, 'p1');
      expect(getPlainText(editor, 'p1')).toBe('Hello world');

      // Expected spans:
      // "Hell" (bold only)
      // "o w" (bold + italic)
      // "orld" (italic only)
      expect(spans.length).toBe(3);
      expect(spans[0].text).toBe('Hell');
      expect(spans[0].marks.map((m) => m.type)).toEqual(['bold']);
      expect(spans[1].text).toBe('o w');
      expect(spans[1].marks.map((m) => m.type).sort()).toEqual(['bold', 'italic']);
      expect(spans[2].text).toBe('orld');
      expect(spans[2].marks.map((m) => m.type)).toEqual(['italic']);
    });
  });

  describe('Idempotent mark operations', () => {
    it('should not duplicate marks when adding same mark twice', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: PLAIN_CONTENT,
      });

      // Add bold twice to same range
      editor.dispatch({
        steps: [{ type: 'addMark', blockId: 'p1', from: 0, to: 5, mark: { type: 'bold' } }],
      });
      editor.dispatch({
        steps: [{ type: 'addMark', blockId: 'p1', from: 0, to: 5, mark: { type: 'bold' } }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans[0].marks.length).toBe(1);
      expect(spans[0].marks[0].type).toBe('bold');
    });
  });

  describe('Edge cases', () => {
    it('should handle mark on empty text', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: {
          version: 1,
          blocks: [{
            id: 'e1',
            type: 'paragraph',
            attrs: {},
            content: [],
            children: [],
          }],
        },
      });

      // AddMark on empty content should be a no-op (no text to mark)
      editor.dispatch({
        steps: [{ type: 'addMark', blockId: 'e1', from: 0, to: 0, mark: { type: 'bold' } }],
      });

      const spans = getSpans(editor, 'e1');
      expect(spans.length).toBe(0);
    });

    it('should handle mark on full text', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold],
        content: PLAIN_CONTENT,
      });

      editor.dispatch({
        steps: [{ type: 'addMark', blockId: 'p1', from: 0, to: 11, mark: { type: 'bold' } }],
      });

      const spans = getSpans(editor, 'p1');
      expect(spans.length).toBe(1);
      expect(spans[0].text).toBe('Hello world');
      expect(spans[0].marks).toEqual([{ type: 'bold' }]);
    });

    it('should handle addMark + removeMark in single transaction', async () => {
      const editor = await createEditor({
        extensions: [Paragraph, Bold, Italic],
        content: CONTENT_WITH_BOLD,
      });

      // In one transaction: remove bold from 6-10, add italic to 6-10
      editor.dispatch({
        steps: [
          { type: 'removeMark', blockId: 'b1', from: 6, to: 10, markType: 'bold' },
          { type: 'addMark', blockId: 'b1', from: 6, to: 10, mark: { type: 'italic' } },
        ],
      });

      const spans = getSpans(editor, 'b1');
      expect(getPlainText(editor, 'b1')).toBe('Hello bold world');
      const markedSpan = spans.find((s) => s.text === 'bold');
      expect(markedSpan).toBeTruthy();
      expect(markedSpan!.marks.map((m) => m.type)).toEqual(['italic']);
    });
  });
});
