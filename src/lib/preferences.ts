import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userPreferences } from "@/lib/db/schema";
import { CATEGORIES, SCOPES, type Category, type Scope } from "@/config/taxonomy";
import type { RangeOption, SortOption } from "@/lib/query";

export interface UserPreferences {
  categories: Category[];
  scopes: Scope[]; // empty = every non-personal scope
  defaultSort: SortOption;
  defaultRange: RangeOption;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  categories: [],
  scopes: [],
  defaultSort: "newest",
  defaultRange: "1d",
};

const SORTS: SortOption[] = ["newest", "trending", "popular", "oldest"];
const RANGES: RangeOption[] = ["live", "1d", "week", "month", "past-month", "year"];

/** Scopes a personalized feed may draw from — everything except the personal feed itself. */
export const SOURCE_SCOPES: Scope[] = SCOPES.filter((s) => !s.requiresAuth).map((s) => s.id);

/**
 * Stored ids are validated against the taxonomy on the way out, not just on the
 * way in: a category renamed or dropped from config would otherwise keep
 * filtering a feed by a value nothing can match.
 */
function validCategories(values: string[]): Category[] {
  const known = new Set(CATEGORIES.map((c) => c.id as string));
  return values.filter((v) => known.has(v)) as Category[];
}

function validScopes(values: string[]): Scope[] {
  const known = new Set(SOURCE_SCOPES as string[]);
  return values.filter((v) => known.has(v)) as Scope[];
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (!row) return DEFAULT_PREFERENCES;

  return {
    categories: validCategories(row.categories),
    scopes: validScopes(row.scopes),
    defaultSort: SORTS.includes(row.defaultSort as SortOption)
      ? (row.defaultSort as SortOption)
      : DEFAULT_PREFERENCES.defaultSort,
    defaultRange: RANGES.includes(row.defaultRange as RangeOption)
      ? (row.defaultRange as RangeOption)
      : DEFAULT_PREFERENCES.defaultRange,
  };
}

export async function savePreferences(userId: string, input: UserPreferences): Promise<void> {
  const row = {
    categories: validCategories(input.categories),
    scopes: validScopes(input.scopes),
    defaultSort: SORTS.includes(input.defaultSort) ? input.defaultSort : DEFAULT_PREFERENCES.defaultSort,
    defaultRange: RANGES.includes(input.defaultRange) ? input.defaultRange : DEFAULT_PREFERENCES.defaultRange,
    updatedAt: new Date(),
  };

  await db
    .insert(userPreferences)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: userPreferences.userId, set: row });
}
