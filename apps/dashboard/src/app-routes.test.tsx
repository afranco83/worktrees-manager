import { faker } from "@faker-js/faker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { projectSchema, type Project } from "@/features/projects/schemas";
import {
  FAKE_HOME,
  resetProjectsStore,
  resetSettingsStore,
  resetWorktreesStore,
} from "@/test/msw/handlers";
import { server } from "@/test/msw/server";

import { appRoutes } from "./app-routes";

function buildProject(overrides: Partial<Project> = {}): Project {
  return projectSchema.parse({
    id: faker.string.uuid(),
    name: faker.company.name(),
    localPath: `/repos/${faker.helpers.slugify(faker.company.name()).toLowerCase()}`,
    devCommand: "pnpm dev",
    repoOwner: null,
    repoName: null,
    createdAt: faker.date.recent().toISOString(),
    ...overrides,
  });
}

const EXISTING_PROJECT = buildProject();

function renderApp(initialPath = "/"): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(appRoutes, { initialEntries: [initialPath] });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("app routes", () => {
  beforeEach(() => {
    resetProjectsStore();
    resetWorktreesStore();
    resetSettingsStore();
  });

  it("should show an empty state at / when no project has been registered yet", async () => {
    renderApp();

    expect(
      await screen.findByText("Selecciona un proyecto o añade uno nuevo para empezar."),
    ).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay proyectos registrados.")).toBeInTheDocument();
  });

  it("should redirect from / to the first project's detail page when projects exist", async () => {
    resetProjectsStore([EXISTING_PROJECT]);
    renderApp();

    expect(await screen.findByRole("heading", { name: EXISTING_PROJECT.name })).toBeInTheDocument();
    // La ruta local también aparece en el sidebar: se acota la búsqueda al panel
    // de detalle (<main>) para no ser ambiguo.
    expect(
      within(screen.getByRole("main")).getByText(EXISTING_PROJECT.localPath),
    ).toBeInTheDocument();
  });

  it("should switch the detail panel when a different project is picked from the sidebar", async () => {
    const secondProject = buildProject();
    resetProjectsStore([EXISTING_PROJECT, secondProject]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("heading", { name: EXISTING_PROJECT.name });

    await user.click(screen.getByRole("link", { name: new RegExp(secondProject.name) }));

    expect(await screen.findByRole("heading", { name: secondProject.name })).toBeInTheDocument();
  });

  it("should add a project from the sidebar and navigate to its detail page", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay proyectos registrados.");
    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));

    await user.type(screen.getByLabelText("Ruta local"), "/repos/new-project");
    await user.tab();
    await waitFor(() => expect(screen.getByLabelText("Comando de arranque")).toBeEnabled());

    await user.type(screen.getByLabelText("Comando de arranque"), "pnpm dev");
    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));

    expect(await screen.findByRole("heading", { name: "new-project" })).toBeInTheDocument();
  });

  it("should keep the rest of the form disabled until the local path is confirmed as a valid git repo", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay proyectos registrados.");
    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));

    expect(screen.getByLabelText("Comando de arranque")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Añadir proyecto" })).toBeDisabled();

    await user.type(screen.getByLabelText("Ruta local"), "/repos/not-a-git-repo");
    await user.tab();

    expect(await screen.findByText(/Esta carpeta no es un repositorio git/)).toBeInTheDocument();
    expect(screen.getByLabelText("Comando de arranque")).toBeDisabled();
  });

  it("should explain that the repo needs a commit when the git repo has none yet", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay proyectos registrados.");
    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));

    await user.type(screen.getByLabelText("Ruta local"), "/repos/no-commits-repo");
    await user.tab();

    expect(await screen.findByText(/no tiene ningún commit/)).toBeInTheDocument();
  });

  it("should explain that the folder needs write permission when it is not writable", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay proyectos registrados.");
    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));

    await user.type(screen.getByLabelText("Ruta local"), "/repos/not-writable-repo");
    await user.tab();

    expect(await screen.findByText(/no tienes permisos de escritura/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Comando de arranque")).toBeDisabled();
  });

  it("should show an error and unblock from the stuck state when the path lookup request fails", async () => {
    server.use(
      http.get("/api/projects/lookup", () =>
        HttpResponse.json({ error: "Internal Server Error", message: "fallo" }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay proyectos registrados.");
    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));

    await user.type(screen.getByLabelText("Ruta local"), "/repos/any-path");
    await user.tab();

    expect(await screen.findByText(/No se ha podido comprobar la ruta/)).toBeInTheDocument();
  });

  it("should fill in the local path when a folder is picked from the directory browser", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay proyectos registrados.");
    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));
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
    renderApp();

    await screen.findByRole("heading", { name: EXISTING_PROJECT.name });

    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));
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
    renderApp();

    await screen.findByRole("heading", { name: EXISTING_PROJECT.name });
    await user.click(screen.getByRole("button", { name: "Editar proyecto" }));

    const nameInput = screen.getByLabelText("Nombre");
    await user.clear(nameInput);
    await user.type(nameInput, "renamed-project");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("heading", { name: "renamed-project" })).toBeInTheDocument();
  });

  it("should navigate back to the empty state when the only project is deleted", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("heading", { name: EXISTING_PROJECT.name });
    await user.click(screen.getByRole("button", { name: "Borrar proyecto" }));

    const confirmDialog = await screen.findByRole("alertdialog");
    await user.click(within(confirmDialog).getByRole("button", { name: "Borrar" }));

    expect(
      await screen.findByText("Selecciona un proyecto o añade uno nuevo para empezar."),
    ).toBeInTheDocument();
  });

  it("should show an empty state when the project has no worktrees yet", async () => {
    resetProjectsStore([EXISTING_PROJECT]);
    renderApp();

    expect(await screen.findByText("Todavía no hay worktrees creados.")).toBeInTheDocument();
  });

  it("should create a worktree from the default branch and list it", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));

    await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));

    expect(await screen.findByText("feature-a")).toBeInTheDocument();
  });

  it("should open a terminal for a worktree without navigating away", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await screen.findByText("feature-a");

    await user.click(screen.getByRole("button", { name: "Abrir terminal" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should start and stop a worktree's dev environment", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await screen.findByText("feature-a");

    expect(screen.getByText("Parado")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Arrancar entorno" }));

    expect(await screen.findByText("Corriendo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Parar entorno" }));

    expect(await screen.findByText("Parado")).toBeInTheDocument();
  });

  it("should set and clear a worktree's dev command override", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await screen.findByText("feature-a");

    expect(screen.queryByText("Comando personalizado")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar comando de arranque" }));
    await user.type(
      screen.getByLabelText("Comando de arranque"),
      "pnpm dev -- --filter=api --filter=storefront",
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Comando personalizado")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar comando de arranque" }));
    await user.clear(screen.getByLabelText("Comando de arranque"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(screen.queryByText("Comando personalizado")).not.toBeInTheDocument();
    });
  });

  it("should show the log history when opening the logs dialog for a worktree", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await screen.findByText("feature-a");

    await user.click(screen.getByRole("button", { name: "Arrancar entorno" }));
    await screen.findByText("Corriendo");

    await user.click(screen.getByRole("button", { name: "Ver logs" }));

    expect(await screen.findByText("Servidor de desarrollo arrancado")).toBeInTheDocument();
  });

  it("should delete a clean worktree when the deletion is confirmed", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await screen.findByText("feature-a");

    await user.click(screen.getByRole("button", { name: "Borrar worktree" }));
    await screen.findByText("Borrar worktree: feature-a");
    await user.click(screen.getByRole("button", { name: "Borrar" }));

    await waitFor(() => {
      expect(screen.getByText("Todavía no hay worktrees creados.")).toBeInTheDocument();
    });
  });

  it("should offer to force-delete a worktree with uncommitted changes", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await user.type(screen.getByLabelText("Nueva rama"), "feature-dirty");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await screen.findByText("feature-dirty");

    await user.click(screen.getByRole("button", { name: "Borrar worktree" }));
    await user.click(screen.getByRole("button", { name: "Borrar" }));

    const forceButton = await screen.findByRole("button", { name: "Forzar borrado" });
    await user.click(forceButton);

    await waitFor(() => {
      expect(screen.getByText("Todavía no hay worktrees creados.")).toBeInTheDocument();
    });
  });

  it("should update the terminal preference and port range from the settings dialog", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("heading", { name: EXISTING_PROJECT.name });
    await user.click(screen.getByRole("button", { name: "Ajustes" }));

    await user.click(await screen.findByRole("combobox", { name: "Terminal preferida" }));
    await user.click(await screen.findByRole("option", { name: "iTerm2" }));

    const portStartInput = screen.getByLabelText("Puerto inicial");
    await user.clear(portStartInput);
    await user.type(portStartInput, "5000");

    const portEndInput = screen.getByLabelText("Puerto final");
    await user.clear(portEndInput);
    await user.type(portEndInput, "5999");

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Ajustes" })).not.toBeInTheDocument();
    });
  });

  it("should reject a custom terminal command that does not contain the {path} placeholder", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("heading", { name: EXISTING_PROJECT.name });
    await user.click(screen.getByRole("button", { name: "Ajustes" }));

    await user.click(await screen.findByRole("combobox", { name: "Terminal preferida" }));
    await user.click(await screen.findByRole("option", { name: "Personalizado…" }));

    await user.type(screen.getByLabelText("Comando personalizado"), "open -a MiTerminal");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(
      await screen.findByText("El comando debe contener el placeholder {path}"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Ajustes" })).toBeInTheDocument();
  });
});
