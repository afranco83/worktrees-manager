import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import {
  logEntrySchema,
  projectGitInfoSchema,
  worktreeSchema,
  type CreateWorktreeFormValues,
  type LogEntry,
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

export async function openWorktreeTerminal(id: string): Promise<void> {
  await apiRequest(`/api/worktrees/${id}/open-terminal`, { method: "POST" });
}

export async function startWorktree(id: string): Promise<Worktree> {
  return worktreeSchema.parse(await apiRequest(`/api/worktrees/${id}/start`, { method: "POST" }));
}

export async function stopWorktree(id: string): Promise<Worktree> {
  return worktreeSchema.parse(await apiRequest(`/api/worktrees/${id}/stop`, { method: "POST" }));
}

export async function fetchWorktreeLogs(id: string): Promise<LogEntry[]> {
  return z.array(logEntrySchema).parse(await apiRequest(`/api/worktrees/${id}/logs`));
}
