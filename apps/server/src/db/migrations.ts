export interface Migration {
  name: string;
  up: string;
}

export const migrations: Migration[] = [
  {
    name: "0001_init",
    up: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        local_path TEXT NOT NULL UNIQUE,
        dev_command TEXT NOT NULL,
        port_range_start INTEGER NOT NULL,
        port_range_end INTEGER NOT NULL,
        repo_owner TEXT,
        repo_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE worktrees (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        branch TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        port INTEGER NOT NULL,
        process_status TEXT NOT NULL DEFAULT 'stopped'
          CHECK (process_status IN ('stopped', 'starting', 'running', 'error')),
        pid INTEGER,
        pr_number INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_worktrees_project_id ON worktrees (project_id);

      CREATE TABLE log_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worktree_id TEXT NOT NULL REFERENCES worktrees (id) ON DELETE CASCADE,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        stream TEXT NOT NULL CHECK (stream IN ('stdout', 'stderr')),
        content TEXT NOT NULL
      );

      CREATE INDEX idx_log_entries_worktree_id_timestamp ON log_entries (worktree_id, timestamp);
    `,
  },
  {
    // Un puerto es un recurso de la máquina, no del proyecto: el índice es global,
    // no por project_id (ver ADR-0003).
    name: "0002_worktrees_port_unique",
    up: `
      CREATE UNIQUE INDEX idx_worktrees_port_unique ON worktrees (port);
    `,
  },
];
