import { NextRequest, NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingestion/run";

export const maxDuration = 300; // seconds; requires a Vercel plan that supports it, capped otherwise

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const results = await ingestAll();
  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  return NextResponse.json({ ok: true, totalInserted, results });
}
