import { z } from "zod";

const PORT_RANGE_MESSAGE = "El puerto inicial debe ser menor que el puerto final";

export const appSettingsSchema = z.object({
  preferredTerminalCommand: z.string().nullable(),
  portRangeStart: z.number().int(),
  portRangeEnd: z.number().int(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const updateAppSettingsFormSchema = z
  .object({
    preferredTerminalCommand: z.string().min(1).nullable(),
    portRangeStart: z.coerce.number().int().positive(),
    portRangeEnd: z.coerce.number().int().positive(),
  })
  .refine((value) => value.portRangeStart < value.portRangeEnd, {
    message: PORT_RANGE_MESSAGE,
    path: ["portRangeEnd"],
  });

export type UpdateAppSettingsFormValues = z.output<typeof updateAppSettingsFormSchema>;
export type UpdateAppSettingsFormInput = z.input<typeof updateAppSettingsFormSchema>;

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
