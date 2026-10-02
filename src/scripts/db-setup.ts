// Applies the hand-written SQL in drizzle/manual/ (search index, analytics views).
// Run after `npm run db:push`. Safe to run again.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (put it in .env.local)");

  const sql = postgres(url, { prepare: false, onnotice: () => {} });
  const dir = join(process.cwd(), "drizzle", "manual");
  try {
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await sql.unsafe(readFileSync(join(dir, file), "utf8"));
      console.log(`applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
