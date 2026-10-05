import type { NextRequest } from "next/server";
import { searchArticles } from "@/lib/query";
import { handle, ok, parseQuery } from "@/lib/api/http";
import { searchQuery } from "@/lib/api/params";
import { toArticleDTO } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

/** GET /api/search?q=... — full-text search across every source and date. */
export function GET(request: NextRequest) {
  return handle(async () => {
    const { q } = parseQuery(searchQuery, request.nextUrl.searchParams);
    const stories = await searchArticles(q, Date.now());
    return ok(stories.map(toArticleDTO), { query: q, count: stories.length });
  })();
}
