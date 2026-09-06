export interface SummarizeInput {
  title: string;
  sourceText: string;
  sourceName: string;
}

import { AnthropicProvider } from "./anthropic";

export interface AiProvider {
  /** Returns a grounded plain-language summary, or null on any failure (caller falls back silently). */
  summarize(input: SummarizeInput): Promise<string | null>;
  /** Translates already-generated English UI/summary text to Hindi, or null on failure. */
  translateToHindi(text: string): Promise<string | null>;
  /** Optional reranking of an already-bounded candidate set. Returns reordered ids, or null on failure. */
  rerank(candidates: { id: string; title: string }[]): Promise<string[] | null>;
}

let cached: AiProvider | null | undefined;

/**
 * Returns the configured AI provider, or null if no key is set. The rest of
 * the app must treat null as "AI layer disabled" and keep working on
 * deterministic ranking + headline-only cards — never block on this.
 */
export function getAiProvider(): AiProvider | null {
  if (cached !== undefined) return cached;

  cached = process.env.ANTHROPIC_API_KEY ? new AnthropicProvider() : null;
  return cached;
}
