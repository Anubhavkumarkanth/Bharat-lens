import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchText } from "./http";

export interface ExtractedArticle {
  textContent: string;
  /** Readability HTML, sanitized when rendered. */
  html: string | null;
  byline: string | null;
}

// Fetches the article and extracts the text with Readability. Null on failure,
// in which case only the headline and link are shown.
export async function extractArticleText(url: string): Promise<ExtractedArticle | null> {
  const html = await fetchText(url, 15000);
  if (!html) return null;

  try {
    const { document } = parseHTML(html);
    // linkedom's Document works with Readability, the types just don't match
    const reader = new Readability(document as unknown as Document);
    const parsed = reader.parse();
    if (!parsed?.textContent) return null;

    const text = parsed.textContent.trim().replace(/\n{3,}/g, "\n\n");
    if (text.length < 200) return null; // too short to summarize

    return { textContent: text, html: parsed.content ?? null, byline: parsed.byline ?? null };
  } catch {
    return null;
  }
}
