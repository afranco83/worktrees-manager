import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import {
  projectGitInfoSchema,
  worktreeSchema,
  type CreateWorktreeFormValues,
  type ProjectGitInfo,
  type Worktree,
} from "../schemas";

export async function fetchProjectGitInfo(projectId: string): Promise<ProjectGitInfo> {
  return projectGitInfoSchema.parse(await apiRequest(`/api/projects/${projectId}/git-info`));
}

export async function fetchWorktrees(projectId: string): Promise<Worktree[]> {
  return z.array(worktreeSchema).parse(await apiRequest(`/api/projects/${projectId}/worktrees`));
}

export async function createWorktree({
  projectId,
  input,
}: {
  projectId: string;
  input: CreateWorktreeFormValues;
}): Promise<Worktree> {
  return worktreeSchema.parse(
    await apiRequest(`/api/projects/${projectId}/worktrees`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteWorktree({ id, force }: { id: string; force: boolean }): Promise<void> {
  await apiRequest(`/api/worktrees/${id}?force=${force}`, { method: "DELETE" });
}
