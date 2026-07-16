import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { FAKE_HOME, resetProjectsStore } from "@/test/msw/handlers";

import type { Project } from "../schemas";
import { ProjectsPage } from "./projects-page";

const EXISTING_PROJECT: Project = {
  id: "8f14e45f-ceea-467e-8555-a41d712dc5a1",
  name: "worktrees-manager",
  localPath: "/repos/worktrees-manager",
  devCommand: "pnpm dev",
  portRangeStart: 3000,
  portRangeEnd: 3099,
  repoOwner: null,
  repoName: null,
  createdAt: "2026-07-16T00:00:00.000Z",
};

function renderProjectsPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  render(<ProjectsPage />, { wrapper: Wrapper });
}

describe("ProjectsPage", () => {
  beforeEach(() => {
    resetProjectsStore();
  });

  it("should list the existing projects when they are already registered", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    renderProjectsPage();

    expect(await screen.findByText("worktrees-manager")).toBeInTheDocument();
    expect(screen.getByText("/repos/worktrees-manager")).toBeInTheDocument();
  });

  it("should show an empty state when no project has been registered yet", async () => {
    renderProjectsPage();

    expect(await screen.findByText("Todavía no hay proyectos registrados.")).toBeInTheDocument();
  });

  it("should add a project to the list when the create form is submitted with valid data", async () => {
    const user = userEvent.setup();
    renderProjectsPage();

    await screen.findByText("Todavía no hay proyectos registrados.");

    await user.click(screen.getByRole("button", { name: "+ Añadir proyecto" }));

    await user.type(screen.getByLabelText("Ruta local"), "/repos/new-project");
    await user.tab();
    await waitFor(() => expect(screen.getByLabelText("Comando de arranque")).toBeEnabled());

    await user.type(screen.getByLabelText("Comando de arranque"), "pnpm dev");
    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));

    expect(await screen.findByText("new-project")).toBeInTheDocument();
  });

  it("should keep the rest of the form disabled until the local path is confirmed as a valid git repo", async () => {
    const user = userEvent.setup();
    renderProjectsPage();

    await screen.findByText("Todavía no hay proyectos registrados.");
    await user.click(screen.getByRole("button", { name: "+ Añadir proyecto" }));

    expect(screen.getByLabelText("Comando de arranque")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Añadir proyecto" })).toBeDisabled();

    await user.type(screen.getByLabelText("Ruta local"), "/repos/not-a-git-repo");
    await user.tab();

    expect(await screen.findByText(/Esta carpeta no es un repositorio git/)).toBeInTheDocument();
    expect(screen.getByLabelText("Comando de arranque")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Añadir proyecto" })).toBeDisabled();
  });

  it("should explain that the repo needs a commit when the git repo has none yet", async () => {
    const user = userEvent.setup();
    renderProjectsPage();

    await screen.findByText("Todavía no hay proyectos registrados.");
    await user.click(screen.getByRole("button", { name: "+ Añadir proyecto" }));

    await user.type(screen.getByLabelText("Ruta local"), "/repos/no-commits-repo");
    await user.tab();

    expect(await screen.findByText(/no tiene ningún commit/)).toBeInTheDocument();
    expect(screen.getByLabelText("Comando de arranque")).toBeDisabled();
  });

  it("should explain that the folder needs write permission when it is not writable", async () => {
    const user = userEvent.setup();
    renderProjectsPage();

    await screen.findByText("Todavía no hay proyectos registrados.");
    await user.click(screen.getByRole("button", { name: "+ Añadir proyecto" }));

    await user.type(screen.getByLabelText("Ruta local"), "/repos/not-writable-repo");
    await user.tab();

    expect(await screen.findByText(/permisos de escritura/)).toBeInTheDocument();
    expect(screen.getByLabelText("Comando de arranque")).toBeDisabled();
  });

  it("should fill in the local path when a folder is picked from the directory browser", async () => {
    const user = userEvent.setup();
    renderProjectsPage();

    await screen.findByText("Todavía no hay proyectos registrados.");

    await user.click(screen.getByRole("button", { name: "+ Añadir proyecto" }));
    await user.click(screen.getByRole("button", { name: "Explorar…" }));

    await user.click(await screen.findByRole("button", { name: "projects" }));
    await user.click(await screen.findByRole("button", { name: "my-repo" }));
    await user.click(screen.getByRole("button", { name: "Seleccionar esta carpeta" }));

    expect(screen.getByLabelText("Ruta local")).toHaveValue(`${FAKE_HOME}/projects/my-repo`);
    expect(screen.getByLabelText("Nombre")).toHaveValue("my-repo");
  });

  it("should show a conflict error when creating a project with an already-registered local path", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderProjectsPage();

    await screen.findByText("worktrees-manager");

    await user.click(screen.getByRole("button", { name: "+ Añadir proyecto" }));
    await user.type(screen.getByLabelText("Ruta local"), EXISTING_PROJECT.localPath);
    await user.tab();
    await waitFor(() => expect(screen.getByLabelText("Comando de arranque")).toBeEnabled());

    await user.type(screen.getByLabelText("Comando de arranque"), "pnpm dev");
    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya existe un proyecto con esa ruta",
    );
  });

  it("should update the project name when the edit form is submitted", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderProjectsPage();

    await user.click(await screen.findByRole("button", { name: "Editar" }));

    const nameInput = screen.getByLabelText("Nombre");
    await user.clear(nameInput);
    await user.type(nameInput, "renamed-project");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("renamed-project")).toBeInTheDocument();
  });

  it("should remove the project from the list when the deletion is confirmed", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderProjectsPage();

    await user.click(await screen.findByRole("button", { name: "Borrar" }));

    const confirmDialog = await screen.findByRole("alertdialog");
    await user.click(within(confirmDialog).getByRole("button", { name: "Borrar" }));

    await waitFor(() => {
      expect(screen.getByText("Todavía no hay proyectos registrados.")).toBeInTheDocument();
    });
  });
});
