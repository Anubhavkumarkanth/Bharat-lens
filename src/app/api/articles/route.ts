import type { NextRequest } from "next/server";
import { queryArticles } from "@/lib/query";
import type { Scope, Category } from "@/config/taxonomy";
import { handle, ok, parseQuery } from "@/lib/api/http";
import { listArticlesQuery, PAGE_SIZE } from "@/lib/api/params";
import { toArticleDTO } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/articles
 *   ?scope=india&category=sports&sort=newest&range=1d&page=1
 *
 * A paginated, filtered list of clustered stories. Validated query params, a
 * stable DTO, and pagination metadata so a client knows whether to fetch more.
 */
export function GET(request: NextRequest) {
  return handle(async () => {
    const q = parseQuery(listArticlesQuery, request.nextUrl.searchParams);

    const stories = await queryArticles({
      scope: (q.scope ?? "india") as Scope,
      category: q.category as Category | undefined,
      sort: q.sort,
      range: q.range,
      page: q.page,
    });

    return ok(stories.map(toArticleDTO), {
      page: q.page,
      pageSize: PAGE_SIZE,
      // A full page implies there is probably another; a short one is the end.
      hasMore: stories.length === PAGE_SIZE,
      filters: { scope: q.scope ?? "india", category: q.category ?? null, sort: q.sort, range: q.range },
    });
  })();
}
