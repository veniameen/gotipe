import type { AiProofreadSuggestion, AiProvider } from "@gotipe/ai";

/**
 * Mock AI provider for playground demos.
 * Streams pre-written text with delays to simulate real AI behavior.
 */

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

const LOREM_PARAGRAPH =
  "Artificial intelligence continues to transform how we create and edit documents. " +
  "Modern AI models can understand context, suggest improvements, and generate content " +
  "that matches the tone and style of existing text. This enables writers to focus on " +
  "ideas while the AI handles the mechanical aspects of writing.";

const REVIEW_COMMENTS = [
  {
    id: "rc-1",
    blockId: "",
    from: 0,
    to: 10,
    quotedText: "",
    body: "Consider adding specific metrics or KPIs for this goal to make it more measurable.",
    category: "clarity" as const,
  },
  {
    id: "rc-2",
    blockId: "",
    from: 0,
    to: 10,
    quotedText: "",
    body: "The timeline mentioned here should align with the project roadmap in Section 3.",
    category: "logic" as const,
  },
];

export const mockAiProvider: AiProvider = {
  name: "mock",

  async *generateCompletion(context) {
    const words = LOREM_PARAGRAPH.split(" ");
    for (const word of words) {
      await delay(80, context.signal);
      yield `${word} `;
    }
  },

  async generateSuggestions(_prompt, context) {
    await delay(300, context.signal);
    return [
      {
        id: `sug-${Math.random().toString(36).slice(2, 8)}`,
        type: "completion",
        content: "Here is a suggested improvement based on your prompt.",
        confidence: 0.85,
      },
    ];
  },

  async executeCommand(command, context) {
    await delay(500, context.signal);
    return `Mock response for command: ${command}`;
  },

  async *streamRewrite(text, context) {
    await delay(400, context.signal);
    // Simple "improvement": capitalize sentences and clean up
    const improved = text
      .replace(/\.\s+([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`)
      .replace(/^([a-z])/, (_, c: string) => c.toUpperCase());
    yield improved;
  },

  async proofread(context) {
    await delay(800, context.signal);
    const blocks = context.surroundingBlocks ?? [];
    const results: AiProofreadSuggestion[] = [];

    for (const block of blocks) {
      if (!Array.isArray(block.content)) continue;
      const fullText = block.content.map((s) => s.text).join("");
      const idx = fullText.toLowerCase().indexOf("to be determined");
      if (idx !== -1) {
        results.push({
          type: "replace",
          originalText: fullText.slice(idx, idx + "to be determined".length),
          suggestedText: "yet to be finalized",
          reason: "More precise phrasing",
          id: `ps-${Math.random().toString(36).slice(2, 8)}`,
          blockId: block.id,
          from: idx,
          to: idx + "to be determined".length,
        });
      }
    }

    return results;
  },

  async reviewComments(context) {
    await delay(1000, context.signal);
    const blocks = context.surroundingBlocks ?? [];
    const textual = blocks.filter((block) => block.content !== null);
    return REVIEW_COMMENTS.slice(0, textual.length).map((comment, index) => {
      const block = textual[index]!;
      const text =
        typeof block.content === "string"
          ? block.content
          : (block.content ?? []).map((span) => span.text).join("");
      const quote = Array.from(text).slice(0, 10).join("");
      return {
        ...comment,
        id: crypto.randomUUID(),
        blockId: block.id,
        from: 0,
        to: quote.length,
        quotedText: quote,
      };
    });
  },

  async *generateParagraph(prompt, context) {
    const sentences = [
      `Based on the topic "${prompt}", here are some key considerations. `,
      "First, it is important to establish clear objectives and measurable outcomes. ",
      "Second, stakeholder alignment should be achieved early in the process to avoid costly revisions later. ",
      "Finally, regular checkpoints and iterative feedback loops will ensure the project stays on track.",
    ];
    for (const sentence of sentences) {
      await delay(250, context.signal);
      yield sentence;
    }
  },
};
