import { migrate } from "drizzle-orm/postgres-js/migrator";

import { closeDatabase, getDatabase } from "./client-core";

await migrate(getDatabase(), { migrationsFolder: "drizzle" });
await closeDatabase();
