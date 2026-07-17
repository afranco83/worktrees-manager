import { z } from "zod";

const PORT_RANGE_MESSAGE = "portRangeStart debe ser menor que portRangeEnd";
const PORT_RANGE_TOGETHER_MESSAGE = "portRangeStart y portRangeEnd deben enviarse juntos";

export const appSettingsSchema = z.object({
  preferredTerminalCommand: z.string().nullable(),
  portRangeStart: z.number().int(),
  portRangeEnd: z.number().int(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const updateAppSettingsSchema = z
  .object({
    preferredTerminalCommand: z.string().min(1).nullable(),
    portRangeStart: z.number().int().positive(),
    portRangeEnd: z.number().int().positive(),
  })
  .partial()
  .refine((value) => (value.portRangeStart == null) === (value.portRangeEnd == null), {
    message: PORT_RANGE_TOGETHER_MESSAGE,
    path: ["portRangeEnd"],
  })
  .refine(
    (value) =>
      value.portRangeStart == null ||
      value.portRangeEnd == null ||
      value.portRangeStart < value.portRangeEnd,
    { message: PORT_RANGE_MESSAGE, path: ["portRangeEnd"] },
  );

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
