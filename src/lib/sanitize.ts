import { parseHTML } from "linkedom";

// Allowlist sanitizer for publisher HTML. The reader renders it with
// dangerouslySetInnerHTML, so anything not listed here gets dropped.
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

// Only http(s) URLs survive. Relative links are resolved against the article URL.
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

  // copy first, the tree changes while we walk it
  const elements = Array.from(root.querySelectorAll("*")) as Element[];

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      // unwrap disallowed wrappers like div/span but keep their text
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

    // no window.opener for outbound links
    if (tag === "a" && el.getAttribute("href")) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }
  }

  dropNavigationLists(root);

  return root.innerHTML;
}

// Removes breadcrumbs and nav lists that Readability leaves in ("Home / News /
// Delhi"). A list where every item is just a short link is treated as navigation.
function dropNavigationLists(root: Element): void {
  for (const list of Array.from(root.querySelectorAll("ul, ol")) as Element[]) {
    const items = Array.from(list.querySelectorAll("li")) as Element[];
    if (items.length === 0) continue;

    const allAreShortLinks = items.every((li) => {
      const link = li.querySelector("a");
      if (!link) return false;
      const itemText = (li.textContent ?? "").trim();
      const linkText = (link.textContent ?? "").trim();
      // item is only a short link
      return itemText === linkText && itemText.split(/\s+/).length <= 3;
    });

    if (allAreShortLinks) list.remove();
  }
}

// Cuts the article down to about `fraction` of its text, for sources we can't
// show in full. Counts text length (not elements) and keeps whole blocks.
export function leadIn(html: string, fraction = 0.35): string {
  const { document } = parseHTML(`<div id="root">${html}</div>`);
  const root = document.getElementById("root");
  if (!root) return "";

  const blocks = Array.from(root.children) as Element[];
  if (blocks.length === 0) return html;

  // measure the total the same way as each block (root textContent includes extra whitespace)
  const lengths = blocks.map((b) => (b.textContent ?? "").trim().length);
  const total = lengths.reduce((sum, n) => sum + n, 0);
  if (total === 0) return html;

  const budget = total * fraction;
  const kept: string[] = [];
  let accumulated = 0;

  // add whole blocks until over budget (the last one can go over)
  for (const [i, block] of blocks.entries()) {
    kept.push(block.outerHTML);
    accumulated += lengths[i];
    if (accumulated >= budget) break;
  }

  return kept.join("");
}

// ~average reading speed, minimum 1 minute
export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 225));
}
