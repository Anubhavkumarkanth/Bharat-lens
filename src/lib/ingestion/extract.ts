import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchText } from "./http";

export interface ExtractedArticle {
  textContent: string;
  byline: string | null;
}

/**
 * Fetches the canonical page and extracts full article text via Readability.
 * Returns null on any failure — callers must treat that as "fail loudly":
 * show headline + source link only, never summarize from a headline alone.
 */
export async function extractArticleText(url: string): Promise<ExtractedArticle | null> {
  const html = await fetchText(url, 15000);
  if (!html) return null;

  try {
    const { document } = parseHTML(html);
    // Readability's types target the real DOM lib; linkedom's Document is structurally compatible at runtime.
    const reader = new Readability(document as unknown as Document);
    const parsed = reader.parse();
    if (!parsed?.textContent) return null;

    const text = parsed.textContent.trim().replace(/\n{3,}/g, "\n\n");
    if (text.length < 200) return null; // too thin to ground a summary in

    return { textContent: text, byline: parsed.byline ?? null };
  } catch {
    return null;
  }
}
