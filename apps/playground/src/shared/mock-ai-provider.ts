/**
 * Mock AI provider for playground demos.
 * Streams pre-written text with delays to simulate real AI behavior.
 */

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LOREM_PARAGRAPH =
  'Artificial intelligence continues to transform how we create and edit documents. ' +
  'Modern AI models can understand context, suggest improvements, and generate content ' +
  'that matches the tone and style of existing text. This enables writers to focus on ' +
  'ideas while the AI handles the mechanical aspects of writing.';

const PROOFREAD_SUGGESTIONS = [
  {
    id: 'ps-1',
    type: 'replace' as const,
    blockId: '', // filled dynamically
    from: 0,
    to: 0,
    originalText: 'to be determined',
    suggestedText: 'yet to be finalized',
    reason: 'More precise phrasing',
  },
];

const REVIEW_COMMENTS = [
  {
    id: 'rc-1',
    blockId: '',
    from: 0,
    to: 10,
    quotedText: '',
    body: 'Consider adding specific metrics or KPIs for this goal to make it more measurable.',
    category: 'clarity' as const,
  },
  {
    id: 'rc-2',
    blockId: '',
    from: 0,
    to: 10,
    quotedText: '',
    body: 'The timeline mentioned here should align with the project roadmap in Section 3.',
    category: 'logic' as const,
  },
];

export const mockAiProvider = {
  name: 'mock',

  async *generateCompletion(_context: unknown) {
    const words = LOREM_PARAGRAPH.split(' ');
    for (const word of words) {
      await delay(80);
      yield word + ' ';
    }
  },

  async generateSuggestions(_prompt: string, _context: unknown) {
    await delay(300);
    return [
      {
        id: 'sug-' + Math.random().toString(36).slice(2, 8),
        type: 'completion',
        content: 'Here is a suggested improvement based on your prompt.',
        confidence: 0.85,
      },
    ];
  },

  async executeCommand(command: string, _context: unknown) {
    await delay(500);
    return `Mock response for command: ${command}`;
  },

  async *streamRewrite(text: string, _context: unknown) {
    await delay(400);
    // Simple "improvement": capitalize sentences and clean up
    const improved = text
      .replace(/\.\s+([a-z])/g, (_, c: string) => '. ' + c.toUpperCase())
      .replace(/^([a-z])/, (_, c: string) => c.toUpperCase());
    yield improved;
  },

  async proofread(context: { surroundingBlocks?: Array<{ id: string; content: unknown }> }) {
    await delay(800);
    const blocks = context.surroundingBlocks ?? [];
    const results = [];

    for (const block of blocks) {
      if (!Array.isArray(block.content)) continue;
      const fullText = (block.content as Array<{ text: string }>).map((s) => s.text).join('');
      const idx = fullText.toLowerCase().indexOf('to be determined');
      if (idx !== -1) {
        results.push({
          ...PROOFREAD_SUGGESTIONS[0],
          id: 'ps-' + Math.random().toString(36).slice(2, 8),
          blockId: block.id,
          from: idx,
          to: idx + 'to be determined'.length,
        });
      }
    }

    return results;
  },

  async reviewComments(context: { surroundingBlocks?: Array<{ id: string }> }) {
    await delay(1000);
    const blocks = context.surroundingBlocks ?? [];
    return REVIEW_COMMENTS.map((c, i) => ({
      ...c,
      id: 'rc-' + Math.random().toString(36).slice(2, 8),
      blockId: blocks[Math.min(i + 2, blocks.length - 1)]?.id ?? '',
    }));
  },

  async *generateParagraph(prompt: string, _context: unknown) {
    const sentences = [
      `Based on the topic "${prompt}", here are some key considerations. `,
      'First, it is important to establish clear objectives and measurable outcomes. ',
      'Second, stakeholder alignment should be achieved early in the process to avoid costly revisions later. ',
      'Finally, regular checkpoints and iterative feedback loops will ensure the project stays on track.',
    ];
    for (const sentence of sentences) {
      await delay(250);
      yield sentence;
    }
  },
};
