import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let queryClient: ReturnType<typeof postgres> | undefined;

export function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required outside the in-memory demo repository");
  }

  queryClient ??= postgres(databaseUrl, { max: 10, prepare: false });
  return drizzle(queryClient, { schema });
}

export async function closeDatabase(): Promise<void> {
  if (queryClient) {
    await queryClient.end();
    queryClient = undefined;
  }
}
