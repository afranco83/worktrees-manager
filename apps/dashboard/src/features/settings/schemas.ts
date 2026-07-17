import { z } from "zod";

export const appSettingsSchema = z.object({
  preferredTerminalCommand: z.string().nullable(),
  portRangeStart: z.number().int(),
  portRangeEnd: z.number().int(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const terminalOptionSchema = z.object({
  name: z.string(),
  command: z.string(),
});

export type TerminalOption = z.infer<typeof terminalOptionSchema>;

export const terminalPresetsResponseSchema = z.object({
  platform: z.string(),
  presets: z.array(terminalOptionSchema),
});

export type TerminalPresetsResponse = z.infer<typeof terminalPresetsResponseSchema>;
