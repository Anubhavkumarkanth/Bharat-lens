import { parseHTML } from "linkedom";

/**
 * Allowlist sanitizer for publisher markup.
 *
 * The reader renders this through dangerouslySetInnerHTML, so anything not
 * explicitly permitted here becomes script execution on our origin — with the
 * reader's Supabase session sitting in cookies. Allowlist, never blocklist:
 * an unknown tag is dropped, an unknown attribute is dropped.
 */
const ALLOWED_TAGS = new Set([
  "p", "br", "hr",
  "h2", "h3", "h4",
  "ul", "ol", "li",
  "blockquote", "figure", "figcaption",
  "strong", "em", "b", "i", "u", "s", "sup", "sub",
  "code", "pre",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt"]),
};

/**
 * Anything that isn't a plain web URL — javascript:, data:, vbscript: — is dropped.
 * Publisher markup is full of root-relative links ("/topic/amazon-cargo"); without
 * a base to resolve them against they'd render as dead anchors, so callers pass
 * the article's canonical URL.
 */
function safeUrl(value: string | null, baseUrl?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (baseUrl && (trimmed.startsWith("/") || trimmed.startsWith("./"))) {
    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export function sanitizeArticleHtml(html: string, baseUrl?: string): string {
  const { document } = parseHTML(`<div id="root">${html}</div>`);
  const root = document.getElementById("root");
  if (!root) return "";

  // Snapshot first: the tree is mutated while walking it.
  const elements = Array.from(root.querySelectorAll("*")) as Element[];

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      // Keep the text of a disallowed wrapper (a <div> or <span> around a
      // paragraph), but drop anything whose content is not prose at all.
      if (tag === "script" || tag === "style" || tag === "noscript" || tag === "iframe") {
        el.remove();
      } else {
        el.replaceWith(...Array.from(el.childNodes));
      }
      continue;
    }

    const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>();
    for (const attr of Array.from(el.attributes) as Attr[]) {
      const name = attr.name.toLowerCase();
      if (!allowed.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" || name === "src") {
        const url = safeUrl(attr.value, baseUrl);
        if (url) el.setAttribute(name, url);
        else el.removeAttribute(attr.name);
      }
    }

    // Outbound links leave our origin — never hand them window.opener.
    if (tag === "a" && el.getAttribute("href")) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }
  }

  return root.innerHTML;
}

/**
 * Cuts sanitized markup down to roughly `fraction` of the article, for sources
 * we may not republish in full.
 *
 * Measured by text length, not element count. Publisher markup opens with short
 * boilerplate blocks — a dateline, a "trusted source" badge — and counting
 * elements spent the entire budget on those before reaching a word of the story.
 * Whole blocks only: a story that stops mid-sentence reads like a bug rather
 * than a deliberate hand-off.
 */
export function leadIn(html: string, fraction = 0.35): string {
  const { document } = parseHTML(`<div id="root">${html}</div>`);
  const root = document.getElementById("root");
  if (!root) return "";

  const blocks = Array.from(root.children) as Element[];
  if (blocks.length === 0) return html;

  // Measure the total the same way the per-block lengths are measured. Reading
  // it off the root instead counts the whitespace between elements, which the
  // block measure trims — that inflated the budget and leaked most of the story.
  const lengths = blocks.map((b) => (b.textContent ?? "").trim().length);
  const total = lengths.reduce((sum, n) => sum + n, 0);
  if (total === 0) return html;

  const budget = total * fraction;
  const kept: string[] = [];
  let accumulated = 0;

  // Accumulate whole blocks until the budget is met, letting the last one
  // overshoot. Stopping *before* an overshoot instead would cut the lead off at
  // the dateline on any story whose first real paragraph is long.
  for (const [i, block] of blocks.entries()) {
    kept.push(block.outerHTML);
    accumulated += lengths[i];
    if (accumulated >= budget) break;
  }

  return kept.join("");
}

/** Average adult reading speed, rounded up; 1 minute is the floor. */
export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 225));
}
