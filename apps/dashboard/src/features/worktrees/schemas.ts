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
  // No persistido: calculado en caliente a partir de los logs del proceso
  // (ver ADR-0007/`process-manager.ts`) — un monorepo con varias apps puede
  // levantar varios puertos distintos del único `port` asignado.
  detectedPorts: z.array(z.number().int()),
});

export type Worktree = z.infer<typeof worktreeSchema>;

export const worktreeBaseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("default") }),
  z.object({ type: z.literal("current") }),
  z.object({ type: z.literal("branch"), branch: z.string().min(1) }),
]);

export type WorktreeBase = z.infer<typeof worktreeBaseSchema>;

export const createWorktreeFormSchema = z.object({
  newBranch: z.string().min(1, "Indica el nombre de la nueva rama"),
  base: worktreeBaseSchema,
});

export type CreateWorktreeFormValues = z.infer<typeof createWorktreeFormSchema>;

export const projectGitInfoSchema = z.object({
  currentBranch: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  branches: z.array(z.string()),
});

export type ProjectGitInfo = z.infer<typeof projectGitInfoSchema>;

// Mismo schema para la respuesta REST del histórico y el payload del evento
// de socket `log-entry` — el `id` actúa de cursor para unir histórico y
// tiempo real sin perder ni duplicar líneas (ver `use-worktree-logs.ts`).
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

export const processStatusEventSchema = z.object({
  worktreeId: z.string().uuid(),
  processStatus: z.enum(WORKTREE_PROCESS_STATUSES),
  pid: z.number().int().nullable(),
});

export type ProcessStatusEvent = z.infer<typeof processStatusEventSchema>;

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
