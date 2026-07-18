import { z } from "zod";

export const WORKTREE_PROCESS_STATUSES = ["stopped", "starting", "running", "error"] as const;
export type WorktreeProcessStatus = (typeof WORKTREE_PROCESS_STATUSES)[number];

export const worktreeSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  branch: z.string(),
  path: z.string(),
  port: z.number().int(),
  processStatus: z.enum(WORKTREE_PROCESS_STATUSES),
  pid: z.number().int().nullable(),
  prNumber: z.number().int().nullable(),
  createdAt: z.string(),
  // No persistido en SQLite: se calcula en caliente a partir del proceso
  // trackeado en memoria (ver `process-manager.ts`), detectando puertos
  // reales anunciados en los logs — un monorepo con varias apps (turbo, npm
  // workspaces...) puede levantar varios puertos distintos del único `port`
  // asignado, que solo es el que se pasa como variable de entorno PORT.
  detectedPorts: z.array(z.number().int()),
});

export type Worktree = z.infer<typeof worktreeSchema>;

const worktreeBaseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("default") }),
  z.object({ type: z.literal("current") }),
  z.object({ type: z.literal("branch"), branch: z.string().min(1) }),
]);

export type WorktreeBase = z.infer<typeof worktreeBaseSchema>;

export const createWorktreeSchema = z.object({
  newBranch: z.string().min(1, "Indica el nombre de la nueva rama"),
  base: worktreeBaseSchema,
});

export type CreateWorktreeInput = z.infer<typeof createWorktreeSchema>;

export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const worktreeIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const deleteWorktreeQuerySchema = z.object({
  // z.coerce.boolean() haría Boolean("false") === true: cualquier string no vacío
  // se coacciona a true, así que se compara el texto explícitamente en su lugar.
  force: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const projectGitInfoSchema = z.object({
  currentBranch: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  branches: z.array(z.string()),
});

export type ProjectGitInfo = z.infer<typeof projectGitInfoSchema>;

const LOG_ENTRIES_DEFAULT_LIMIT = 500;
const LOG_ENTRIES_MAX_LIMIT = 2000;

// Mismo schema para la respuesta REST del histórico y el payload del evento de
// socket `log-entry` — el `id` real de `log_entries` actúa de cursor para que
// el cliente pueda unir histórico + tiempo real sin perder ni duplicar líneas.
export const logEntrySchema = z.object({
  id: z.number().int(),
  timestamp: z.string(),
  stream: z.enum(["stdout", "stderr"]),
  content: z.string(),
});

export type LogEntry = z.infer<typeof logEntrySchema>;

/**
 * A diferencia de la respuesta REST (ya acotada a un worktree por la URL), el
 * payload del evento de socket SÍ necesita el `worktreeId`: un cliente unido
 * a varias salas a la vez (p. ej. la lista de worktrees, para reflejar su
 * estado) no tendría forma de saber a cuál pertenece una línea si solo
 * llevara el `LogEntry` a secas — hallazgo real, ver ADR-0007.
 */
export const logEntryEventSchema = z.object({
  worktreeId: z.string().uuid(),
  entry: logEntrySchema,
});

export type LogEntryEvent = z.infer<typeof logEntryEventSchema>;

export const listLogEntriesQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(LOG_ENTRIES_MAX_LIMIT)
    .default(LOG_ENTRIES_DEFAULT_LIMIT),
});

export const processStatusEventSchema = z.object({
  worktreeId: z.string().uuid(),
  processStatus: z.enum(WORKTREE_PROCESS_STATUSES),
  pid: z.number().int().nullable(),
});

export type ProcessStatusEvent = z.infer<typeof processStatusEventSchema>;

// Sub-paso dentro de "starting", para dar más contexto que un genérico
// "arrancando" mientras puede tardar (instalar dependencias reales puede
// llevar bastante más que arrancar el propio `devCommand`).
export const WORKTREE_PROCESS_STEPS = ["installing-dependencies", "starting-dev-command"] as const;
export type WorktreeProcessStep = (typeof WORKTREE_PROCESS_STEPS)[number];

export const processStepEventSchema = z.object({
  worktreeId: z.string().uuid(),
  step: z.enum(WORKTREE_PROCESS_STEPS).nullable(),
});

export type ProcessStepEvent = z.infer<typeof processStepEventSchema>;

export const detectedPortsEventSchema = z.object({
  worktreeId: z.string().uuid(),
  ports: z.array(z.number().int()),
});

export type DetectedPortsEvent = z.infer<typeof detectedPortsEventSchema>;
