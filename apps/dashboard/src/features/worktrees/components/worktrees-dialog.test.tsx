import { faker } from "@faker-js/faker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { projectSchema, type Project } from "@/features/projects/schemas";
import { resetWorktreesStore } from "@/test/msw/handlers";

import { WorktreesDialog } from "./worktrees-dialog";

const PROJECT: Project = projectSchema.parse({
  id: faker.string.uuid(),
  name: faker.company.name(),
  localPath: `/repos/${faker.helpers.slugify(faker.company.name()).toLowerCase()}`,
  devCommand: "pnpm dev",
  portRangeStart: 4100,
  portRangeEnd: 4199,
  repoOwner: null,
  repoName: null,
  createdAt: faker.date.recent().toISOString(),
});

function renderWorktreesDialog(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  render(<WorktreesDialog project={PROJECT} open onOpenChange={() => {}} />, {
    wrapper: Wrapper,
  });
}

describe("WorktreesDialog", () => {
  beforeEach(() => {
    resetWorktreesStore();
  });

  it("should show an empty state when the project has no worktrees yet", async () => {
    renderWorktreesDialog();

    expect(await screen.findByText("Todavía no hay worktrees creados.")).toBeInTheDocument();
  });

  it("should create a worktree from the default branch and list it", async () => {
    const user = userEvent.setup();
    renderWorktreesDialog();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "+ Crear worktree" }));

    await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));

    expect(await screen.findByText("feature-a")).toBeInTheDocument();
  });

  it("should delete a clean worktree when the deletion is confirmed", async () => {
    const user = userEvent.setup();
    renderWorktreesDialog();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "+ Crear worktree" }));
    await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await screen.findByText("feature-a");

    await user.click(screen.getByRole("button", { name: "Borrar" }));
    await screen.findByText("Borrar worktree: feature-a");
    await user.click(screen.getByRole("button", { name: "Borrar" }));

    await waitFor(() => {
      expect(screen.getByText("Todavía no hay worktrees creados.")).toBeInTheDocument();
    });
  });

  it("should offer to force-delete a worktree with uncommitted changes", async () => {
    const user = userEvent.setup();
    renderWorktreesDialog();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "+ Crear worktree" }));
    await user.type(screen.getByLabelText("Nueva rama"), "feature-dirty");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await screen.findByText("feature-dirty");

    await user.click(screen.getByRole("button", { name: "Borrar" }));
    await screen.findByText("Borrar worktree: feature-dirty");
    await user.click(screen.getByRole("button", { name: "Borrar" }));

    const forceButton = await screen.findByRole("button", { name: "Forzar borrado" });
    await user.click(forceButton);

    await waitFor(() => {
      expect(screen.getByText("Todavía no hay worktrees creados.")).toBeInTheDocument();
    });
  });
});
