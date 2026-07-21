import { z } from "zod";

export const WORKTREE_PROCESS_STATUSES = ["stopped", "starting", "running", "error"] as const;
export type WorktreeProcessStatus = (typeof WORKTREE_PROCESS_STATUSES)[number];

// Un monorepo (turbo, npm/pnpm workspaces...) puede levantar varias apps a la
// vez, cada una con su propio puerto — `label` es el nombre de la app cuando
// se puede extraer del prefijo de log de un orquestador (turbo: `paquete:tarea:
// `), `null` si no (repo de una sola app, o formato de log no reconocido).
export const detectedPortSchema = z.object({
  port: z.number().int(),
  label: z.string().nullable(),
});

export type DetectedPort = z.infer<typeof detectedPortSchema>;

export const gitStatusSchema = z.object({
  hasUncommittedChanges: z.boolean(),
  hasUnpushedCommits: z.boolean(),
});

export type GitStatusSummary = z.infer<typeof gitStatusSchema>;

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
  // `null` hereda el `devCommand` del proyecto — permite restringir qué
  // arranca en ESTE worktree (p. ej. solo algunas apps de un monorepo) sin
  // asumir ninguna herramienta de monorepo concreta, ver ADR-0009.
  devCommandOverride: z.string().nullable(),
  // No persistido: calculado en caliente a partir de los logs del proceso
  // (ver ADR-0007/`process-manager.ts`) — un monorepo con varias apps puede
  // levantar varios puertos distintos del único `port` asignado.
  detectedPorts: z.array(detectedPortSchema),
  // Tampoco persistido: calculado en caliente en el backend — señal de
  // seguridad ante el borrado (cambios sin commitear / commits sin subir a
  // ningún remoto conocido), ver ADR-0012. `null` = no se pudo determinar
  // ahora mismo (p. ej. el directorio del worktree ya no existe en disco).
  gitStatus: gitStatusSchema.nullable(),
});

export type Worktree = z.infer<typeof worktreeSchema>;

export const updateWorktreeFormSchema = z.object({
  devCommandOverride: z.string(),
});

export type UpdateWorktreeFormValues = z.infer<typeof updateWorktreeFormSchema>;

export const PULL_REQUEST_STATES = ["open", "closed", "merged"] as const;
export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];

export const pullRequestSchema = z.object({
  number: z.number().int(),
  state: z.enum(PULL_REQUEST_STATES),
  url: z.string(),
});

export type PullRequestInfo = z.infer<typeof pullRequestSchema>;

export const updateWorktreePrNumberFormSchema = z.object({
  // El backend exige un número de PR positivo (`z.number().int().positive()`,
  // GitHub nunca numera una PR como 0) — se refleja aquí para no depender del
  // 400 del servidor ante ese caso concreto.
  prNumber: z
    .string()
    .regex(/^\d*$/, "Indica solo el número de la PR")
    .refine((value) => value === "" || Number(value) > 0, "El número de PR debe ser mayor que 0"),
});

export type UpdateWorktreePrNumberFormValues = z.infer<typeof updateWorktreePrNumberFormSchema>;

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
  ports: z.array(detectedPortSchema),
});

export type DetectedPortsEvent = z.infer<typeof detectedPortsEventSchema>;
