export interface SummarizeInput {
  title: string;
  sourceText: string;
  sourceName: string;
}

import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";

export interface AiProvider {
  /** Summary from the article text, or null if anything fails. */
  summarize(input: SummarizeInput): Promise<string | null>;
  /** English to Hindi, or null on failure. */
  translateToHindi(text: string): Promise<string | null>;
  /** Reorders the given ids, or null on failure. */
  rerank(candidates: { id: string; title: string }[]): Promise<string[] | null>;
  /** Of the given big-news-day headlines, returns the ones that look real (null on failure). */
  verifyEvents(headlines: string[]): Promise<string[] | null>;
}

let cached: AiProvider | null | undefined;

// Returns the AI provider, or null if no key is set (then AI features are just off).
// Gemini by default since it has a free tier. AI_PROVIDER picks one if both keys are set.
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
