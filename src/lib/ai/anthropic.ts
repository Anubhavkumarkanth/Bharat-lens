import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, SummarizeInput } from "./provider";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const MAX_SOURCE_CHARS = 12000; // keep grounding text + cost bounded

export class AnthropicProvider implements AiProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async summarize(input: SummarizeInput): Promise<string | null> {
    try {
      const sourceText = input.sourceText.slice(0, MAX_SOURCE_CHARS);
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 300,
        system:
          "You summarize news articles for a first-year college student with no domain background. " +
          "Rules: restate only what is in the provided article text, never add outside facts, no predictions, " +
          "no causation the article doesn't state, neutral register (report what the source reported, don't editorialize), " +
          "explain jargon inline in plain language, 3-5 sentences.",
        messages: [
          {
            role: "user",
            content: `Source: ${input.sourceName}\nHeadline: ${input.title}\n\nArticle text:\n${sourceText}`,
          },
        ],
      });
      const block = res.content.find((b) => b.type === "text");
      return block && block.type === "text" ? block.text.trim() : null;
    } catch {
      return null;
    }
  }

  async translateToHindi(text: string): Promise<string | null> {
    try {
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: "Translate the given English text to natural, plain Hindi. Return only the translation, nothing else.",
        messages: [{ role: "user", content: text }],
      });
      const block = res.content.find((b) => b.type === "text");
      return block && block.type === "text" ? block.text.trim() : null;
    } catch {
      return null;
    }
  }

  async rerank(candidates: { id: string; title: string }[]): Promise<string[] | null> {
    if (candidates.length === 0) return [];
    try {
      const list = candidates.map((c, i) => `${i}. [${c.id}] ${c.title}`).join("\n");
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 500,
        system:
          "You reorder a list of news headlines by newsworthiness/importance for a general India-focused audience. " +
          "Return ONLY a JSON array of the ids, most important first, with no other text.",
        messages: [{ role: "user", content: list }],
      });
      const block = res.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") return null;
      const ids = JSON.parse(block.text.trim());
      if (!Array.isArray(ids)) return null;
      return ids as string[];
    } catch {
      return null;
    }
  }
}
