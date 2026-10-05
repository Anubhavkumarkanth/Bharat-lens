import { z } from "zod";
import { SCOPES, CATEGORIES } from "@/config/taxonomy";
import { PAGE_SIZE } from "@/lib/query";

// Enums built from config so the API can never accept a scope or category the
// app doesn't know about — the validation stays in sync with the taxonomy.
const PUBLIC_SCOPES = SCOPES.filter((s) => !s.personal).map((s) => s.id) as [string, ...string[]];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

export const SORTS = ["newest", "trending", "popular", "oldest"] as const;
export const RANGES = ["live", "1d", "week", "month", "past-month", "year"] as const;

/** Query params for GET /api/articles. Unknown values are rejected with 400. */
export const listArticlesQuery = z.object({
  scope: z.enum(PUBLIC_SCOPES).optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  sort: z.enum(SORTS).default("newest"),
  range: z.enum(RANGES).default("1d"),
  page: z.coerce.number().int().min(1).max(100).default(1),
});
export type ListArticlesQuery = z.infer<typeof listArticlesQuery>;

/** Query params for GET /api/search. */
export const searchQuery = z.object({
  q: z.string().trim().min(2, "Search needs at least 2 characters.").max(100),
});
export type SearchQuery = z.infer<typeof searchQuery>;

export { PAGE_SIZE };
