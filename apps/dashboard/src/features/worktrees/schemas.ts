import { z } from "zod";

export const WORKTREE_PROCESS_STATUSES = ["stopped", "starting", "running", "error"] as const;

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
