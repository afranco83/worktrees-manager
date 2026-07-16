import type Database from "better-sqlite3";

import { migrations } from "./migrations.js";

/**
 * Aplica las migraciones pendientes (por nombre, en el orden en que se declaran),
 * cada una en su propia transacción. Solo hacia delante: sin soporte de rollback
 * (ver ADR-0001). Idempotente: volver a llamarla no reaplica migraciones ya trackeadas.
 */
export function runMigrations(db: Database.Database): void {
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedMigrationNames = new Set(
    db
      .prepare<[], { name: string }>("SELECT name FROM schema_migrations")
      .all()
      .map((row) => row.name),
  );

  const pendingMigrations = migrations.filter(
    (migration) => !appliedMigrationNames.has(migration.name),
  );

  for (const migration of pendingMigrations) {
    const applyMigration = db.transaction(() => {
      db.exec(migration.up);
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(migration.name);
    });

    applyMigration();
  }
}
