import { getSourceHealth } from "@/lib/stats";
import { handle, ok } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** GET /api/sources — per-source ingestion health and discovery method. */
export function GET() {
  return handle(async () => {
    const sources = await getSourceHealth();
    return ok(sources, { count: sources.length });
  })();
}
