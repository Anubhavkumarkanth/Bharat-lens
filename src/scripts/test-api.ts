import { listArticlesQuery, searchQuery } from "@/lib/api/params";
import { toArticleDTO } from "@/lib/api/serialize";
import type { StoryCard } from "@/lib/query";

/**
 * API contract tests — the validation layer and the serializer, which is where
 * the public shape is decided. These are pure (no server, no DB): bad input
 * must be rejected, good input must be coerced, and the DTO must not leak
 * internal fields or raw Date objects.
 */
const cases: { desc: string; pass: boolean }[] = [];
function check(desc: string, pass: boolean) {
  cases.push({ desc, pass });
}

// --- list query validation ---
check("defaults apply when params are absent", (() => {
  const q = listArticlesQuery.parse({});
  return q.sort === "newest" && q.range === "1d" && q.page === 1 && q.scope === undefined;
})());

check("a valid scope and category pass", listArticlesQuery.safeParse({ scope: "india", category: "sports" }).success);
check("an unknown scope is rejected", !listArticlesQuery.safeParse({ scope: "atlantis" }).success);
check("an unknown category is rejected", !listArticlesQuery.safeParse({ category: "gossip" }).success);
check("page is coerced from string to number", listArticlesQuery.parse({ page: "3" }).page === 3);
check("page below 1 is rejected", !listArticlesQuery.safeParse({ page: "0" }).success);
check("page above the cap is rejected", !listArticlesQuery.safeParse({ page: "101" }).success);
check("'for-you' is not a public API scope", !listArticlesQuery.safeParse({ scope: "for-you" }).success);

// --- search validation ---
check("a 2-char query passes", searchQuery.safeParse({ q: "ai" }).success);
check("a 1-char query is rejected", !searchQuery.safeParse({ q: "a" }).success);
check("a blank query is rejected", !searchQuery.safeParse({ q: "   " }).success);
check("the query is trimmed", searchQuery.parse({ q: "  modi  " }).q === "modi");

// --- serializer contract ---
{
  const card: StoryCard = {
    clusterId: "cl1",
    id: "a1",
    title: "Example headline",
    canonicalUrl: "https://example.com/x",
    sourceId: "the-hindu",
    sourceName: "The Hindu",
    byline: "A Reporter",
    publishedAt: new Date("2026-10-01T00:00:00Z"),
    discoveredAt: new Date("2026-10-02T00:00:00Z"),
    category: "politics",
    contentType: "news-report",
    isBaseline: false,
    isNew: true,
    excerpt: "…",
    summaryEn: "A two sentence summary.",
    grounded: true,
    otherOutlets: [{ sourceName: "PTI", url: "https://pti.example/x" }],
  };
  const dto = toArticleDTO(card);
  check("dates are serialized to ISO strings", typeof dto.publishedAt === "string" && dto.publishedAt.endsWith("Z"));
  check("source is a named object", dto.source.id === "the-hindu" && dto.source.name === "The Hindu");
  check("otherOutlets becomes alsoReportedBy", dto.alsoReportedBy[0].source === "PTI");
  check("internal fields are not exposed", !("clusterId" in dto) && !("isBaseline" in dto) && !("excerpt" in dto));
  check("a null publishedAt stays null", toArticleDTO({ ...card, publishedAt: null }).publishedAt === null);
}

let passed = 0;
for (const c of cases) {
  if (c.pass) passed++;
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.desc}`);
}
console.log(`\n${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
