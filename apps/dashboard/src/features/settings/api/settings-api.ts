import { apiRequest } from "@/lib/api-client";

import {
  appSettingsSchema,
  terminalPresetsResponseSchema,
  type AppSettings,
  type TerminalPresetsResponse,
  type UpdateAppSettingsFormValues,
} from "../schemas";

export async function fetchSettings(): Promise<AppSettings> {
  return appSettingsSchema.parse(await apiRequest("/api/settings"));
}

export async function updateSettings(
  patch: Partial<UpdateAppSettingsFormValues>,
): Promise<AppSettings> {
  return appSettingsSchema.parse(
    await apiRequest("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  );
}

export async function fetchTerminalPresets(): Promise<TerminalPresetsResponse> {
  return terminalPresetsResponseSchema.parse(await apiRequest("/api/settings/terminal-presets"));
}
