import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  version: number;
  name?: string;
  sql: string;
}

/**
 * Apply ordered SQL migrations under a single IMMEDIATE transaction. The
 * tracking table is created lazily so existing databases can adopt this
 * mechanism without a manual step. IMMEDIATE serializes the web process and
 * the standalone jobs process when they start at the same time.
 */
export function applyMigrations(
  db: DatabaseSync,
  migrations: Migration[],
  trackingTable = "schema_migrations",
): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(trackingTable)) {
    throw new Error(`Invalid migration table name: ${trackingTable}`);
  }

  const ordered = [...migrations].sort((a, b) => a.version - b.version);

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${trackingTable} (
         version INTEGER PRIMARY KEY,
         applied_at INTEGER NOT NULL
       )`,
    );

    const applied = new Set<number>(
      (
        db
          .prepare(`SELECT version FROM ${trackingTable}`)
          .all() as unknown as Array<{ version: number }>
      ).map((row) => row.version),
    );

    const record = db.prepare(
      `INSERT INTO ${trackingTable} (version, applied_at) VALUES (?, ?)`,
    );

    for (const migration of ordered) {
      if (applied.has(migration.version)) continue;
      db.exec(migration.sql);
      record.run(migration.version, Math.floor(Date.now() / 1000));
      console.log(
        `[db] applied migration ${migration.version}${migration.name ? ` (${migration.name})` : ""}`,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
