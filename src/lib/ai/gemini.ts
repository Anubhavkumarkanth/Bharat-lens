import type { AiProvider, SummarizeInput } from "./provider";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_SOURCE_CHARS = 12000; // keep grounding text bounded, same budget as the Anthropic path
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
}

/**
 * Google AI Studio has a genuine free tier, which is why this is the default
 * provider — Bharat Lens has to run at zero cost. The interface is identical to
 * the Anthropic path, so every grounding rule in CLAUDE.md applies unchanged:
 * only the fetched article text is ever sent, and any failure returns null so
 * the caller falls back to headline + source link.
 */
export class GeminiProvider implements AiProvider {
  private async generate(
    system: string,
    user: string,
    maxOutputTokens: number
  ): Promise<string | null> {
    try {
      const res = await fetch(
        `${ENDPOINT}/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens, temperature: 0.2 },
          }),
        }
      );
      if (!res.ok) return null;

      const data = (await res.json()) as { candidates?: GeminiCandidate[] };
      // No candidate means a safety block or an empty generation — both are
      // "no summary", never a reason to fabricate one.
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? text.trim() : null;
    } catch {
      return null;
    }
  }

  async summarize(input: SummarizeInput): Promise<string | null> {
    const sourceText = input.sourceText.slice(0, MAX_SOURCE_CHARS);
    return this.generate(
      "You summarize news articles for a first-year college student with no domain background. " +
        "Rules: restate only what is in the provided article text, never add outside facts, no predictions, " +
        "no causation the article doesn't state, neutral register (report what the source reported, don't editorialize), " +
        "explain jargon inline in plain language. Write EXACTLY two sentences — the first says what happened, " +
        "the second says what it means or what follows. No preamble, no bullet points.",
      `Source: ${input.sourceName}\nHeadline: ${input.title}\n\nArticle text:\n${sourceText}`,
      150
    );
  }

  async translateToHindi(text: string): Promise<string | null> {
    return this.generate(
      "Translate the given English text to natural, everyday Hindi as spoken in India — " +
        "use the common word people actually say, including familiar English loanwords, over formal Sanskritised Hindi. " +
        "Return only the translation, nothing else.",
      text,
      400
    );
  }

  async rerank(candidates: { id: string; title: string }[]): Promise<string[] | null> {
    if (candidates.length === 0) return [];

    const list = candidates.map((c, i) => `${i}. [${c.id}] ${c.title}`).join("\n");
    const raw = await this.generate(
      "You reorder a list of news headlines by newsworthiness/importance for a general India-focused audience. " +
        "Return ONLY a JSON array of the ids, most important first, with no other text.",
      list,
      500
    );
    if (!raw) return null;

    try {
      // Gemini often wraps JSON in a markdown fence even when told not to.
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const ids = JSON.parse(cleaned);
      return Array.isArray(ids) ? (ids as string[]) : null;
    } catch {
      return null;
    }
  }

  async verifyEvents(headlines: string[]): Promise<string[] | null> {
    if (headlines.length === 0) return [];

    const list = headlines.map((h, i) => `${i}. ${h}`).join("\n");
    const raw = await this.generate(
      "You are filtering a list of headlines that spiked in coverage on a given day. " +
        "Keep only the ones that describe a real, newsworthy event. Drop recycled evergreen content, " +
        "listicles, horoscopes, promotional copy, and anything that looks like automated or duplicated filler. " +
        "Return ONLY a JSON array of the kept headline strings, verbatim, with no other text.",
      list,
      500
    );
    if (!raw) return null;

    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const kept = JSON.parse(cleaned);
      return Array.isArray(kept) ? (kept as string[]) : null;
    } catch {
      return null;
    }
  }

}
