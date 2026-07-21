import { faker } from "@faker-js/faker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { setWorktreePullRequest } from "@/test/msw/handlers";

import { worktreePullRequestQueryKey } from "../api/use-worktree-pull-request";
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

function renderList(worktrees: Worktree[]): {
  queryClient: QueryClient;
  rerenderWith: (worktrees: Worktree[]) => void;
} {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function ui(currentWorktrees: Worktree[]) {
    return (
      <QueryClientProvider client={queryClient}>
        <WorktreesCardList
          worktrees={currentWorktrees}
          stepByWorktreeId={{}}
          latestLogByWorktreeId={{}}
          onDelete={vi.fn()}
        />
      </QueryClientProvider>
    );
  }

  const { rerender } = render(ui(worktrees));

  return { queryClient, rerenderWith: (nextWorktrees) => rerender(ui(nextWorktrees)) };
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

  it("should not show a pull request badge when none is associated", async () => {
    const worktree = buildWorktree();
    const { queryClient } = renderList([worktree]);

    await waitFor(() => {
      expect(queryClient.getQueryState(worktreePullRequestQueryKey(worktree.id))?.status).toBe(
        "success",
      );
    });
    expect(screen.queryByText(/^PR #/)).not.toBeInTheDocument();
  });

  it("should show an open pull request as a link to GitHub", async () => {
    const worktree = buildWorktree();
    setWorktreePullRequest(worktree.id, {
      number: 7,
      state: "open",
      url: "https://github.com/example/repo/pull/7",
    });
    renderList([worktree]);

    const badge = await screen.findByText("PR #7 · Abierta");

    expect(badge.closest("a")).toHaveAttribute("href", "https://github.com/example/repo/pull/7");
  });

  it("should show a merged pull request", async () => {
    const worktree = buildWorktree();
    setWorktreePullRequest(worktree.id, {
      number: 6,
      state: "merged",
      url: "https://github.com/example/repo/pull/6",
    });
    renderList([worktree]);

    expect(await screen.findByText("PR #6 · Mergeada")).toBeInTheDocument();
  });

  it("should not discard an in-progress PR number edit when the worktree is refreshed by a background poll", async () => {
    const user = userEvent.setup();
    const worktree = buildWorktree();
    const { rerenderWith } = renderList([worktree]);

    await user.click(screen.getByRole("button", { name: "Asociar PR" }));
    await user.type(screen.getByLabelText("Número de PR"), "42");

    // Simula el refetch de `useWorktrees` (poll de 5s): una nueva referencia
    // del mismo worktree, sin cambios reales, mientras el diálogo sigue
    // abierto y el usuario está escribiendo.
    rerenderWith([{ ...worktree }]);

    expect(screen.getByLabelText("Número de PR")).toHaveValue("42");
  });

  it("should not discard an in-progress dev command edit when the worktree is refreshed by a background poll", async () => {
    const user = userEvent.setup();
    const worktree = buildWorktree();
    const { rerenderWith } = renderList([worktree]);

    await user.click(screen.getByRole("button", { name: "Editar comando de arranque" }));
    await user.type(screen.getByLabelText("Comando de arranque"), "pnpm dev --filter=api");

    rerenderWith([{ ...worktree }]);

    expect(screen.getByLabelText("Comando de arranque")).toHaveValue("pnpm dev --filter=api");
  });
});
