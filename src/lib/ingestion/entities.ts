/**
 * Decodes HTML entities in text pulled from feeds, sitemaps and page titles.
 *
 * Publishers routinely emit `&#x27;` and `&#8217;` inside RSS <title>, and many
 * double-encode (`&amp;#x27;` in the XML), so the XML parser's own entity pass
 * leaves a literal `&#x27;` behind. Stored undecoded, that renders verbatim on
 * every card — React escapes text, so the entity never resolves in the browser.
 *
 * Safe to run on anything we store as text: these values are rendered as text,
 * never as markup, so decoding `&lt;` here cannot introduce an injection.
 */

/** Named entities that actually turn up in news headlines. Numeric forms cover the rest. */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ", // a normal space: a non-breaking one in a headline only breaks wrapping
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201D",
  ldquo: "\u201C",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  middot: "\u00B7",
  deg: "\u00B0",
  eacute: "\u00E9",
  egrave: "\u00E8",
  uuml: "\u00FC",
  ouml: "\u00F6",
  auml: "\u00E4",
  ccedil: "\u00E7",
  ntilde: "\u00F1",
  aacute: "\u00E1",
  iacute: "\u00ED",
  oacute: "\u00F3",
  uacute: "\u00FA",
  pound: "\u00A3",
  euro: "\u20AC",
  rupee: "\u20B9",
  trade: "\u2122",
  copy: "\u00A9",
  reg: "\u00AE",
};

const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,31});/gi;

function decodeOnce(text: string): string {
  return text.replace(ENTITY, (match, body: string) => {
    const token = body.toLowerCase();

    if (token.startsWith("#x")) {
      const code = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? safeFromCodePoint(code, match) : match;
    }
    if (token.startsWith("#")) {
      const code = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? safeFromCodePoint(code, match) : match;
    }
    return NAMED[token] ?? match; // unknown name: leave it alone rather than guess
  });
}

function safeFromCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback; // out of range — keep the original text
  }
}

/**
 * Decodes repeatedly to unwrap double-encoded input, bounded so a string like
 * "&amp;amp;amp;..." can't spin. Stops as soon as a pass changes nothing.
 */
export function decodeEntities(text: string): string {
  let current = text;
  for (let pass = 0; pass < 3; pass++) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}
