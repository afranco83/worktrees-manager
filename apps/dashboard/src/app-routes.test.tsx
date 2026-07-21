import { faker } from "@faker-js/faker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    postCreateCommand: null,
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

// Abrir el menú "Más" con `user.click` no responde de forma fiable en
// jsdom — particularidad conocida de simulación de eventos de puntero de
// base-ui bajo jsdom, no reproducible con un ratón real (verificado
// manualmente en navegador). La activación por teclado sí abre con
// fiabilidad, y es una forma igual de válida y accesible de hacerlo.
async function openMoreActionsMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  screen.getByRole("button", { name: "Más" }).focus();
  await user.keyboard("{Enter}");
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

    expect(
      await within(screen.getByRole("main")).findByRole("heading", { name: EXISTING_PROJECT.name }),
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

  it("should autofill devCommand and postCreateCommand from an existing .worktrees-manager.json", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay proyectos registrados.");
    await user.click(screen.getByRole("button", { name: "Añadir proyecto" }));

    await user.type(screen.getByLabelText("Ruta local"), "/repos/has-config-file");
    await user.tab();

    await waitFor(() => expect(screen.getByLabelText("Comando de arranque")).toBeEnabled());
    expect(screen.getByLabelText("Comando de arranque")).toHaveValue("pnpm dev");
    expect(screen.getByLabelText("Comando posterior a la creación")).toHaveValue("pnpm db:migrate");
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

  it("should set the project's post-create command when the edit form is submitted", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("heading", { name: EXISTING_PROJECT.name });
    await user.click(screen.getByRole("button", { name: "Editar proyecto" }));

    await user.type(screen.getByLabelText("Comando posterior a la creación"), "pnpm db:migrate");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Comando posterior a la creación")).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Editar proyecto" }));

    expect(screen.getByLabelText("Comando posterior a la creación")).toHaveValue("pnpm db:migrate");
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

    await openMoreActionsMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Terminal" }));

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

    expect(screen.getByRole("button", { name: "Arrancar" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Arrancar" }));

    expect(await screen.findByRole("button", { name: "Parar" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Parar" }));

    expect(await screen.findByRole("button", { name: "Arrancar" })).toBeInTheDocument();
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

    await openMoreActionsMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Comando de arranque" }));
    await user.type(
      screen.getByLabelText("Comando de arranque"),
      "pnpm dev -- --filter=api --filter=storefront",
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Comando personalizado")).toBeInTheDocument();

    await openMoreActionsMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Comando de arranque" }));
    await user.clear(screen.getByLabelText("Comando de arranque"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(screen.queryByText("Comando personalizado")).not.toBeInTheDocument();
    });
  });

  it("should associate a pull request manually and show its badge without waiting for the poll", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await screen.findByText("feature-a");

    expect(screen.queryByText(/^PR #/)).not.toBeInTheDocument();

    await openMoreActionsMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "PR" }));
    await user.type(screen.getByLabelText("Número de PR"), "7");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("PR #7 · Abierta")).toBeInTheDocument();

    await openMoreActionsMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "PR" }));
    await user.clear(screen.getByLabelText("Número de PR"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(screen.queryByText(/^PR #/)).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Arrancar" }));
    await screen.findByRole("button", { name: "Parar" });

    await user.click(screen.getByRole("button", { name: "Logs" }));

    expect(await screen.findByText("Servidor de desarrollo arrancado")).toBeInTheDocument();
  });

  it("should clear the visible log entries without deleting the underlying history", async () => {
    resetProjectsStore([EXISTING_PROJECT]);

    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Todavía no hay worktrees creados.");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
    await user.click(screen.getByRole("button", { name: "Crear worktree" }));
    await screen.findByText("feature-a");

    await user.click(screen.getByRole("button", { name: "Arrancar" }));
    await screen.findByRole("button", { name: "Parar" });

    await user.click(screen.getByRole("button", { name: "Logs" }));
    await screen.findByText("Servidor de desarrollo arrancado");

    await user.click(screen.getByRole("button", { name: "Limpiar" }));

    expect(screen.queryByText("Servidor de desarrollo arrancado")).not.toBeInTheDocument();
    expect(screen.getByText("Todavía no hay salida de este proceso.")).toBeInTheDocument();

    // Solo limpia la vista actual: al reabrir el diálogo, el histórico sigue
    // ahí de verdad (no se ha borrado nada en el servidor).
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Logs" }));

    expect(await screen.findByText("Servidor de desarrollo arrancado")).toBeInTheDocument();
  });

  it("should copy the plain-text log to the clipboard", async () => {
    resetProjectsStore([EXISTING_PROJECT]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    // Se muta `navigator.clipboard` en vez de sustituir todo `navigator` vía
    // `vi.stubGlobal`: un `{ ...navigator }` sale vacío (sus propiedades
    // reales viven en el prototipo), así que reemplazarlo entero rompería
    // cualquier otro código que dependa de un `navigator` real durante el
    // test. Se define DESPUÉS de `userEvent.setup()` a propósito: este
    // último instala su propio stub de `navigator.clipboard` (lo necesita
    // para simular copiar/pegar), y lo haría después si se definiera antes,
    // pisando este mock.
    const originalClipboard = navigator.clipboard as Clipboard | undefined;
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    try {
      renderApp();

      await screen.findByText("Todavía no hay worktrees creados.");
      await user.click(screen.getByRole("button", { name: "Crear worktree" }));
      await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
      await user.click(screen.getByRole("button", { name: "Crear worktree" }));
      await screen.findByText("feature-a");

      await user.click(screen.getByRole("button", { name: "Arrancar" }));
      await screen.findByRole("button", { name: "Parar" });

      await user.click(screen.getByRole("button", { name: "Logs" }));
      await screen.findByText("Servidor de desarrollo arrancado");

      await user.click(screen.getByRole("button", { name: "Copiar" }));

      // El botón solo pasa a "Copiado" después de que `writeText` resuelva
      // (`handleCopy` es async) — esperar a él antes de comprobar la llamada
      // asegura que la promesa ya se ha resuelto.
      expect(await screen.findByRole("button", { name: "Copiado" })).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("Servidor de desarrollo arrancado"),
      );
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        value: originalClipboard,
        configurable: true,
      });
    }
  });

  it("should download the plain-text log as a .txt file named after the branch", async () => {
    resetProjectsStore([EXISTING_PROJECT]);
    const objectUrl = "blob:mock-url";
    // Se sobrescriben solo los dos métodos estáticos necesarios — sustituir
    // el propio `URL` global (vía `vi.stubGlobal`) rompe cualquier `new URL()`
    // real que ocurra durante el test (usado, p. ej., por react-router).
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => objectUrl);
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    try {
      const user = userEvent.setup();
      renderApp();

      await screen.findByText("Todavía no hay worktrees creados.");
      await user.click(screen.getByRole("button", { name: "Crear worktree" }));
      await user.type(screen.getByLabelText("Nueva rama"), "feature-a");
      await user.click(screen.getByRole("button", { name: "Crear worktree" }));
      await screen.findByText("feature-a");

      await user.click(screen.getByRole("button", { name: "Arrancar" }));
      await screen.findByRole("button", { name: "Parar" });

      await user.click(screen.getByRole("button", { name: "Logs" }));
      await screen.findByText("Servidor de desarrollo arrancado");

      await user.click(screen.getByRole("button", { name: "Descargar" }));

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(clickSpy.mock.instances[0]).toHaveProperty("download", "feature-a-logs.txt");
      expect(clickSpy.mock.instances[0]).toHaveProperty("href", objectUrl);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      clickSpy.mockRestore();
    }
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

    await openMoreActionsMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
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

    await openMoreActionsMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Borrar" }));
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
