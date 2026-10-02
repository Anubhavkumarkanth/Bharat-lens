import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let instance: PostgresJsDatabase<typeof schema> | null = null;

// Connects on the first query, not on import. Next loads route modules during
// the build, and the build shouldn't need DATABASE_URL.
function getDb(): PostgresJsDatabase<typeof schema> {
  if (instance) return instance;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Supabase connection string."
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
