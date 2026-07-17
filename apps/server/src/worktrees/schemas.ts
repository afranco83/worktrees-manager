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
