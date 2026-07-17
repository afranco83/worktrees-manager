import type Database from "better-sqlite3";

import type { AppSettings } from "./schemas.js";

interface AppSettingsRow {
  id: number;
  preferred_terminal_command: string | null;
  port_range_start: number;
  port_range_end: number;
}

function toAppSettings(row: AppSettingsRow): AppSettings {
  return {
    preferredTerminalCommand: row.preferred_terminal_command,
    portRangeStart: row.port_range_start,
    portRangeEnd: row.port_range_end,
  };
}

export function getSettings(db: Database.Database): AppSettings {
  const row = db.prepare<[], AppSettingsRow>("SELECT * FROM app_settings WHERE id = 1").get();

  // La migración 0003_app_settings siembra la fila id=1 en el mismo momento en
  // que crea la tabla: si no existe, el esquema no se aplicó bien, no es un
  // caso de negocio que haya que manejar con gracia.
  if (!row) {
    throw new Error("La fila de ajustes globales (app_settings, id=1) no existe");
  }

  return toAppSettings(row);
}

export function updateSettings(
  db: Database.Database,
  patch: Partial<{
    preferredTerminalCommand: string | null;
    portRangeStart: number;
    portRangeEnd: number;
  }>,
): AppSettings {
  const updated = { ...getSettings(db), ...patch };

  db.prepare(
    `UPDATE app_settings
     SET preferred_terminal_command = ?, port_range_start = ?, port_range_end = ?
     WHERE id = 1`,
  ).run(updated.preferredTerminalCommand, updated.portRangeStart, updated.portRangeEnd);

  return updated;
}
