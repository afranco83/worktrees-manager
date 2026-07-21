import { faker } from "@faker-js/faker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { worktreeSchema, type Worktree } from "../schemas";
import { WorktreesCardList } from "./worktrees-card-list";

function buildWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return worktreeSchema.parse({
    id: faker.string.uuid(),
    projectId: faker.string.uuid(),
    branch: faker.git.branch(),
    path: `/repos/project/.worktrees/${faker.git.branch()}`,
    port: faker.internet.port(),
    processStatus: "stopped",
    pid: null,
    prNumber: null,
    createdAt: faker.date.recent().toISOString(),
    devCommandOverride: null,
    detectedPorts: [],
    gitStatus: { hasUncommittedChanges: false, hasUnpushedCommits: false },
    ...overrides,
  });
}

function renderList(worktrees: Worktree[]): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <WorktreesCardList
        worktrees={worktrees}
        stepByWorktreeId={{}}
        latestLogByWorktreeId={{}}
        onDelete={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("WorktreesCardList", () => {
  it("should not show any git status badge when gitStatus could not be determined", () => {
    renderList([buildWorktree({ gitStatus: null })]);

    expect(screen.queryByText("Cambios sin commitear")).not.toBeInTheDocument();
    expect(screen.queryByText("Commits sin subir")).not.toBeInTheDocument();
  });

  it("should not show any badge when there is nothing pending", () => {
    renderList([
      buildWorktree({ gitStatus: { hasUncommittedChanges: false, hasUnpushedCommits: false } }),
    ]);

    expect(screen.queryByText("Cambios sin commitear")).not.toBeInTheDocument();
    expect(screen.queryByText("Commits sin subir")).not.toBeInTheDocument();
  });

  it("should show a badge for uncommitted changes", () => {
    renderList([
      buildWorktree({ gitStatus: { hasUncommittedChanges: true, hasUnpushedCommits: false } }),
    ]);

    expect(screen.getByText("Cambios sin commitear")).toBeInTheDocument();
    expect(screen.queryByText("Commits sin subir")).not.toBeInTheDocument();
  });

  it("should show a badge for unpushed commits", () => {
    renderList([
      buildWorktree({ gitStatus: { hasUncommittedChanges: false, hasUnpushedCommits: true } }),
    ]);

    expect(screen.getByText("Commits sin subir")).toBeInTheDocument();
    expect(screen.queryByText("Cambios sin commitear")).not.toBeInTheDocument();
  });

  it("should show both badges when both are pending", () => {
    renderList([
      buildWorktree({ gitStatus: { hasUncommittedChanges: true, hasUnpushedCommits: true } }),
    ]);

    expect(screen.getByText("Cambios sin commitear")).toBeInTheDocument();
    expect(screen.getByText("Commits sin subir")).toBeInTheDocument();
  });
});
