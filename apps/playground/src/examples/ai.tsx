import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor } from '@gotipe/react';
import { BlockEditor } from '@gotipe/block-editor';
import {
  AiPreset,
  getProofreadSuggestions,
  acceptProofreadSuggestion,
  rejectProofreadSuggestion,
  acceptAllProofreadSuggestions,
  rejectAllProofreadSuggestions,
} from '@gotipe/ai';
import type { AiProofreadSuggestion } from '@gotipe/ai';
import { ExampleWrapper } from '../shared/example-wrapper';
import { mockAiProvider } from '../shared/mock-ai-provider';
import { useCallback, useEffect, useState } from 'react';

const AI_CONTENT = {
  version: 1,
  blocks: [
    {
      id: 'ai-b1',
      type: 'heading',
      attrs: { level: 1 },
      content: [{ text: 'AI Features Demo', marks: [] }],
      children: [],
    },
    {
      id: 'ai-b2',
      type: 'paragraph',
      attrs: {},
      content: [
        { text: 'This demo shows all three levels of GoTipe AI integration. ', marks: [] },
        { text: 'Start typing and pause to see ghost text suggestions.', marks: [{ type: 'bold', attrs: {} }] },
      ],
      children: [],
    },
    {
      id: 'ai-b3',
      type: 'heading',
      attrs: { level: 2 },
      content: [{ text: 'How to use', marks: [] }],
      children: [],
    },
    {
      id: 'ai-b4',
      type: 'bulletList',
      attrs: {},
      content: null,
      children: [
        {
          id: 'ai-b4-1',
          type: 'listItem',
          attrs: {},
          content: [
            { text: 'Ghost Text: ', marks: [{ type: 'bold', attrs: {} }] },
            { text: 'Type something and pause \u2014 AI suggests completion. Press ', marks: [] },
            { text: 'Tab', marks: [{ type: 'code', attrs: {} }] },
            { text: ' to accept, ', marks: [] },
            { text: 'Escape', marks: [{ type: 'code', attrs: {} }] },
            { text: ' to dismiss.', marks: [] },
          ],
          children: [],
        },
        {
          id: 'ai-b4-2',
          type: 'listItem',
          attrs: {},
          content: [
            { text: 'Improve: ', marks: [{ type: 'bold', attrs: {} }] },
            { text: 'Select text \u2192 Bubble Menu \u2192 \u2728 Improve', marks: [] },
          ],
          children: [],
        },
        {
          id: 'ai-b4-3',
          type: 'listItem',
          attrs: {},
          content: [
            { text: 'Continue Writing: ', marks: [{ type: 'bold', attrs: {} }] },
            { text: 'Type ', marks: [] },
            { text: '/continue', marks: [{ type: 'code', attrs: {} }] },
            { text: ' in the slash menu', marks: [] },
          ],
          children: [],
        },
        {
          id: 'ai-b4-4',
          type: 'listItem',
          attrs: {},
          content: [
            { text: 'AI Command Bar: ', marks: [{ type: 'bold', attrs: {} }] },
            { text: 'Press ', marks: [] },
            { text: 'Cmd+K', marks: [{ type: 'code', attrs: {} }] },
            { text: ' to type a free-text AI prompt', marks: [] },
          ],
          children: [],
        },
      ],
    },
    {
      id: 'ai-b5',
      type: 'paragraph',
      attrs: {},
      content: [
        {
          text: 'The specific details of the implementation are to be determined based on the architecture review.',
          marks: [],
        },
      ],
      children: [],
    },
    {
      id: 'ai-b6',
      type: 'paragraph',
      attrs: {},
      content: [
        {
          text: 'Try typing here and pausing to see ghost text suggestions appear...',
          marks: [{ type: 'italic', attrs: {} }],
        },
      ],
      children: [],
    },
  ],
};

export function AIExample() {
  const [suggestions, setSuggestions] = useState<AiProofreadSuggestion[]>([]);

  const editor = useEditor({
    extensions: [
      DefaultPreset,
      ...AiPreset.map((ext, i) =>
        i === 0
          ? ext.configure({ provider: mockAiProvider, enableAutoComplete: true, debounceMs: 800 })
          : ext,
      ),
    ],
    content: AI_CONTENT,
  });

  // Listen for proofread results
  useEffect(() => {
    if (!editor) return;
    const unsub = editor.on('aiStatusChange', () => {
      const sug = getProofreadSuggestions(editor);
      setSuggestions([...sug]);
    });
    return unsub;
  }, [editor]);

  const handleAccept = useCallback(
    (s: { id: string }) => {
      if (!editor) return;
      acceptProofreadSuggestion(editor, s.id);
      setSuggestions(getProofreadSuggestions(editor));
    },
    [editor],
  );

  const handleReject = useCallback(
    (s: { id: string }) => {
      if (!editor) return;
      rejectProofreadSuggestion(editor, s.id);
      setSuggestions(getProofreadSuggestions(editor));
    },
    [editor],
  );

  const handleAcceptAll = useCallback(() => {
    if (!editor) return;
    acceptAllProofreadSuggestions(editor);
    setSuggestions([]);
  }, [editor]);

  const handleRejectAll = useCallback(() => {
    if (!editor) return;
    rejectAllProofreadSuggestions(editor);
    setSuggestions([]);
  }, [editor]);

  return (
    <ExampleWrapper
      title="AI Features"
      description="Ghost text autocomplete, AI Improve, Continue Writing, Proofread, and AI Command Bar. Uses a mock AI provider."
      tags={['MIT', 'AI']}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          className="gotipe-toolbar-btn"
          style={{ width: 'auto', padding: '0 12px', fontSize: 13 }}
          onClick={() => editor?.emit('executeAiCommand', { commandId: 'proofread' })}
        >
          Proofread
        </button>
        <button
          className="gotipe-toolbar-btn"
          style={{ width: 'auto', padding: '0 12px', fontSize: 13 }}
          onClick={() => editor?.emit('executeAiCommand', { commandId: 'review' })}
        >
          AI Review
        </button>
        <button
          className="gotipe-toolbar-btn"
          style={{ width: 'auto', padding: '0 12px', fontSize: 13 }}
          onClick={() =>
            editor?.emit('executeAiCommand', {
              commandId: 'addParagraph',
              prompt: 'about AI in document editing',
            })
          }
        >
          + AI Paragraph
        </button>
      </div>

      <BlockEditor
        editor={editor}
        showAiCommandBar={true}
        showThemeToggle={false}
        suggestions={
          suggestions as unknown as Array<{
            id: string;
            type: 'insert' | 'delete' | 'replace';
            blockId: string;
            from: number;
            to: number;
            originalText: string;
            suggestedText: string;
          }>
        }
        onSuggestionAccept={handleAccept}
        onSuggestionReject={handleReject}
        onSuggestionAcceptAll={handleAcceptAll}
        onSuggestionRejectAll={handleRejectAll}
      />
    </ExampleWrapper>
  );
}
