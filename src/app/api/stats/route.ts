import { getCorpusStats } from "@/lib/stats";
import { handle, ok } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/stats — corpus and data-quality summary.
 * Includes dupSourceClusters, the clustering invariant that must stay 0.
 */
export function GET() {
  return handle(async () => ok(await getCorpusStats()))();
}
