import type { AiContext, AiProofreadSuggestion, AiProvider } from "@gotipe/ai";

/**
 * The demo provider: canned text streamed word by word with small delays. No model, no network;
 * every answer below is written here.
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

async function* words(value: string, signal?: AbortSignal, step = 70) {
  for (const word of value.split(/(?<= )/)) {
    await delay(step, signal);
    yield word;
  }
}

const COMPLETION = "ship the beta to the waiting list.";

/** Text of the block at the caret: a completion after a word starts with a space. */
const textOf = (block: AiContext["currentBlock"]) =>
  Array.isArray(block?.content) ? block.content.map((span) => span.text).join("") : "";
const PARAGRAPH =
  "The beta opens to the waiting list on Monday and to everyone a week later. Pricing stays as it is until the next release.";
const VAGUE = "to be decided";

export const demoProvider: AiProvider = {
  name: "demo",
  generateCompletion(context) {
    const before = textOf(context.currentBlock);
    const lead = before && !/\s$/.test(before) ? " " : "";
    return words(lead + COMPLETION, context.signal);
  },
  async generateSuggestions(_prompt, context) {
    await delay(300, context.signal);
    return [{ id: crypto.randomUUID(), type: "completion", content: PARAGRAPH, confidence: 1 }];
  },
  async executeCommand(command, context) {
    await delay(500, context.signal);
    return `Demo provider answer to «${command}»: ${PARAGRAPH}`;
  },
  async *streamRewrite(value, context) {
    await delay(300, context.signal);
    yield* words(
      value.replace(/\bvery\s+/gi, "").replace(/^\w/, (c) => c.toUpperCase()),
      context.signal,
    );
  },
  generateParagraph: (_prompt, context) => words(PARAGRAPH, context.signal),
  async proofread(context) {
    await delay(600, context.signal);
    const found: AiProofreadSuggestion[] = [];
    for (const block of context.surroundingBlocks ?? []) {
      if (!Array.isArray(block.content)) continue;
      const value = block.content.map((span) => span.text).join("");
      const at = value.indexOf(VAGUE);
      if (at < 0) continue;
      found.push({
        id: crypto.randomUUID(),
        type: "replace",
        blockId: block.id,
        from: at,
        to: at + VAGUE.length,
        originalText: VAGUE,
        suggestedText: "set on Friday",
        reason: "A date reads clearer than a promise",
      });
    }
    return found;
  },
};
