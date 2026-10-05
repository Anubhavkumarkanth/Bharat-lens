import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tryDb } from "@/lib/db/availability";
import { ok, fail } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness probe.
 * 200 when the database answers, 503 when it cannot be reached. A monitor or a
 * deploy check can poll this; it is also what proves the degradation path.
 */
export async function GET() {
  const alive = await tryDb(() => db.execute(sql`SELECT 1`));
  if (alive === null) {
    return fail(503, "service_unavailable", "Database unreachable.");
  }
  return ok({ status: "ok", db: "up", time: new Date().toISOString() });
}
