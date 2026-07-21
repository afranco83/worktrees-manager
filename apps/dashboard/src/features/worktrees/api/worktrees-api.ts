import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import {
  logEntrySchema,
  projectGitInfoSchema,
  pullRequestSchema,
  worktreeSchema,
  type CreateWorktreeFormValues,
  type LogEntry,
  type ProjectGitInfo,
  type PullRequestInfo,
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

export async function updateWorktreeDevCommandOverride({
  id,
  devCommandOverride,
}: {
  id: string;
  devCommandOverride: string;
}): Promise<Worktree> {
  return worktreeSchema.parse(
    await apiRequest(`/api/worktrees/${id}`, {
      method: "PATCH",
      // Vacío = sin override (hereda el del proyecto); el backend distingue
      // "sin override" con `null`, no con una string vacía.
      body: JSON.stringify({ devCommandOverride: devCommandOverride.trim() || null }),
    }),
  );
}

export async function fetchWorktreeLogs(id: string): Promise<LogEntry[]> {
  return z.array(logEntrySchema).parse(await apiRequest(`/api/worktrees/${id}/logs`));
}

export async function fetchWorktreePullRequest(id: string): Promise<PullRequestInfo | null> {
  return pullRequestSchema.nullable().parse(await apiRequest(`/api/worktrees/${id}/pull-request`));
}

export async function updateWorktreePrNumber({
  id,
  prNumber,
}: {
  id: string;
  prNumber: number | null;
}): Promise<PullRequestInfo | null> {
  return pullRequestSchema.nullable().parse(
    await apiRequest(`/api/worktrees/${id}/pull-request`, {
      method: "PATCH",
      body: JSON.stringify({ prNumber }),
    }),
  );
}
