import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let client: PGlite;

describe("production database migrations", () => {
  beforeAll(async () => {
    client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  }, 30_000);
  afterAll(async () => client.close());

  it("creates the complete durable control-plane schema", async () => {
    const tables = await client.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public'");
    const names = new Set(tables.rows.map((row) => row.table_name));
    expect(names).toEqual(new Set([
      "approvals", "audit_events", "connections", "memory_items", "organization_memberships", "organizations", "rate_limit_buckets", "run_steps", "runs", "runtime_deployments", "tool_executions", "usage_events", "users", "webhook_events", "worker_triggers", "worker_versions", "workers",
    ]));
  });
});
