export interface SummarizeInput {
  title: string;
  sourceText: string;
  sourceName: string;
}

import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";

export interface AiProvider {
  /** Returns a grounded plain-language summary, or null on any failure (caller falls back silently). */
  summarize(input: SummarizeInput): Promise<string | null>;
  /** Translates already-generated English UI/summary text to Hindi, or null on failure. */
  translateToHindi(text: string): Promise<string | null>;
  /** Optional reranking of an already-bounded candidate set. Returns reordered ids, or null on failure. */
  rerank(candidates: { id: string; title: string }[]): Promise<string[] | null>;
  /**
   * Optional second opinion on whether a detected news spike is a real event
   * rather than coordinated spam or a recycled story. Returns the headlines it
   * judges genuine, or null on any failure — the deterministic multi-source
   * check already stands on its own, so this only ever narrows the list.
   */
  verifyEvents(headlines: string[]): Promise<string[] | null>;
}

let cached: AiProvider | null | undefined;

/**
 * Returns the configured AI provider, or null if no key is set. The rest of
 * the app must treat null as "AI layer disabled" and keep working on
 * deterministic ranking + headline-only cards — never block on this.
 *
 * Gemini is the default because its free tier costs nothing; setting
 * ANTHROPIC_API_KEY later switches the whole app over with no code change.
 * AI_PROVIDER forces one either way when both keys are present.
 */
export function getAiProvider(): AiProvider | null {
  if (cached !== undefined) return cached;

  const forced = process.env.AI_PROVIDER;
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);

  if (forced === "anthropic") cached = hasAnthropic ? new AnthropicProvider() : null;
  else if (forced === "gemini") cached = hasGemini ? new GeminiProvider() : null;
  else if (hasAnthropic) cached = new AnthropicProvider();
  else if (hasGemini) cached = new GeminiProvider();
  else cached = null;

  return cached;
}
