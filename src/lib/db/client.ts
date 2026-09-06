import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let instance: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Lazily creates the DB connection on first query rather than at module
 * import time — Next.js evaluates route modules during build-time page-data
 * collection even for force-dynamic routes, so throwing eagerly here would
 * break `next build` whenever DATABASE_URL isn't set at build time.
 */
function getDb(): PostgresJsDatabase<typeof schema> {
  if (instance) return instance;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.local.example to .env.local and fill in your Supabase connection string."
    );
  }
  const client = postgres(connectionString, { prepare: false });
  instance = drizzle(client, { schema });
  return instance;
}

export const db: PostgresJsDatabase<typeof schema> = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
