import { faker } from "@faker-js/faker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { setWorktreePullRequest } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";

import { worktreePullRequestQueryKey } from "../api/use-worktree-pull-request";
import { worktreeSchema, type Worktree } from "../schemas";
import { WorktreesCardList } from "./worktrees-card-list";

// El diálogo de logs (siempre montado dentro de cada card, aunque cerrado)
// importa el singleton `socket` a nivel de módulo, que conecta de verdad en
// cuanto se carga — sin mock, sus reintentos de polling en segundo plano
// pueden colar una petición real a `/socket.io` durante los `findBy*` de los
// tests de abajo, sin handler MSW que la cubra. Ninguno de estos tests
// ejercita tiempo real, así que mockearlo aquí no resta cobertura.
vi.mock("@/lib/socket", () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

// Abrir el menú "Más" con `user.click` no responde de forma fiable en
// jsdom — particularidad conocida de simulación de eventos de puntero de
// base-ui bajo jsdom, no reproducible con un ratón real (verificado
// manualmente en navegador). La activación por teclado sí abre con fiabilidad.
async function openMoreActionsMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  screen.getByRole("button", { name: "Más" }).focus();
  await user.keyboard("{Enter}");
}

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
        <WorktreesCardList worktrees={currentWorktrees} stepByWorktreeId={{}} onDelete={vi.fn()} />
      </QueryClientProvider>
    );
  }

  const { rerender } = render(ui(worktrees));

  return { queryClient, rerenderWith: (nextWorktrees) => rerender(ui(nextWorktrees)) };
}

describe("WorktreesCardList", () => {
  it("should not show a separate status text while starting, since the footer button's own label already conveys it", () => {
    renderList([buildWorktree({ processStatus: "starting" })]);

    // El propio botón del footer ya muestra "Arrancando…" como su label
    // mientras carga — no debería haber además un indicador de estado
    // aparte con el mismo texto.
    const matches = screen.getAllByText("Arrancando…");
    expect(matches).toHaveLength(1);
    expect(matches[0].closest("button")).not.toBeNull();
  });

  it("should show a status text while in error, since the button looks identical to a stopped worktree otherwise", () => {
    renderList([buildWorktree({ processStatus: "error" })]);

    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("should not show any port while stopped, since the configured port is not a guarantee of what will actually listen", () => {
    renderList([buildWorktree({ processStatus: "stopped", port: 3000, detectedPorts: [] })]);

    expect(screen.queryByText(/Puerto 3000/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /3000/ })).not.toBeInTheDocument();
  });

  it("should not show any port while running until a real one is detected", () => {
    renderList([buildWorktree({ processStatus: "running", pid: 4242, detectedPorts: [] })]);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("should show the real detected ports once known", () => {
    renderList([
      buildWorktree({
        processStatus: "running",
        pid: 4242,
        detectedPorts: [
          { port: 3000, label: "storefront" },
          { port: 4000, label: "api" },
        ],
      }),
    ]);

    expect(screen.getByRole("link", { name: "storefront: 3000" })).toHaveAttribute(
      "href",
      "http://localhost:3000",
    );
    expect(screen.getByRole("link", { name: "api: 4000" })).toHaveAttribute(
      "href",
      "http://localhost:4000",
    );
  });

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

    await openMoreActionsMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "PR" }));
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

    await openMoreActionsMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Comando de arranque" }));
    await user.type(screen.getByLabelText("Comando de arranque"), "pnpm dev --filter=api");

    rerenderWith([{ ...worktree }]);

    expect(screen.getByLabelText("Comando de arranque")).toHaveValue("pnpm dev --filter=api");
  });

  it("should show a loader on the start button and hide the stop button until the start truly finishes", async () => {
    const user = userEvent.setup();
    const worktree = buildWorktree({ processStatus: "stopped" });
    let resolveStart: (worktree: Worktree) => void = () => {};
    const started = new Promise<Worktree>((resolve) => {
      resolveStart = resolve;
    });
    server.use(http.post("/api/worktrees/:id/start", async () => HttpResponse.json(await started)));
    const { rerenderWith } = renderList([worktree]);

    await user.click(screen.getByRole("button", { name: "Arrancar" }));

    expect(await screen.findByRole("button", { name: "Arrancando…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parar" })).not.toBeInTheDocument();

    // El propio `worktree` de props solo se refresca cuando `useWorktrees`
    // recibe la respuesta (o el socket) en la app real — aquí se simula ese
    // mismo paso a mano, ya que este test monta la card de forma aislada. Con
    // un puerto ya detectado para no entrelazar este test con la espera al
    // primer puerto real (cubierta aparte).
    const runningWorktree: Worktree = {
      ...worktree,
      processStatus: "running",
      pid: 4242,
      detectedPorts: [{ port: worktree.port, label: null }],
    };
    resolveStart(runningWorktree);
    rerenderWith([runningWorktree]);

    expect(await screen.findByRole("button", { name: "Parar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arrancando…" })).not.toBeInTheDocument();
  });

  it("should keep showing the start loader even if the process status flips to running before the mutation resolves", async () => {
    const user = userEvent.setup();
    const worktree = buildWorktree({ processStatus: "stopped" });
    let resolveStart: (worktree: Worktree) => void = () => {};
    const started = new Promise<Worktree>((resolve) => {
      resolveStart = resolve;
    });
    server.use(http.post("/api/worktrees/:id/start", async () => HttpResponse.json(await started)));
    const { rerenderWith } = renderList([worktree]);

    await user.click(screen.getByRole("button", { name: "Arrancar" }));
    await screen.findByRole("button", { name: "Arrancando…" });

    // El evento de socket `process-status` llega casi siempre antes que la
    // respuesta HTTP de esta misma mutación (el backend marca "running" en
    // cuanto el proceso hace spawn, sin esperar a que el dev server esté
    // listo) — se simula ese adelanto sin resolver aún la mutación. Con un
    // puerto ya detectado para no entrelazar este test con la espera al
    // primer puerto real (cubierta aparte).
    const runningWorktree: Worktree = {
      ...worktree,
      processStatus: "running",
      pid: 4242,
      detectedPorts: [{ port: worktree.port, label: null }],
    };
    rerenderWith([runningWorktree]);

    expect(screen.getByRole("button", { name: "Arrancando…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parar" })).not.toBeInTheDocument();

    resolveStart(runningWorktree);

    expect(await screen.findByRole("button", { name: "Parar" })).toBeInTheDocument();
  });

  it("should keep showing the start loader after the process reports running until a real port is detected", async () => {
    const user = userEvent.setup();
    const worktree = buildWorktree({ processStatus: "stopped" });
    server.use(
      http.post("/api/worktrees/:id/start", () =>
        HttpResponse.json({ ...worktree, processStatus: "running", pid: 4242 }),
      ),
    );
    const { rerenderWith } = renderList([worktree]);

    await user.click(screen.getByRole("button", { name: "Arrancar" }));

    // La mutación ya se resolvió (sin `defer`, a diferencia de los tests de
    // arriba) pero sigue sin detectarse ningún puerto real — el loader debe
    // seguir ahí, no basta con que `processStatus` sea "running".
    const runningNoPortsYet: Worktree = { ...worktree, processStatus: "running", pid: 4242 };
    rerenderWith([runningNoPortsYet]);

    expect(await screen.findByRole("button", { name: "Arrancando…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parar" })).not.toBeInTheDocument();

    rerenderWith([
      {
        ...runningNoPortsYet,
        detectedPorts: [{ port: worktree.port, label: "storefront" }],
      },
    ]);

    expect(await screen.findByRole("button", { name: "Parar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arrancando…" })).not.toBeInTheDocument();
  });

  it("should show a loader on the stop button and hide the start button until the stop truly finishes", async () => {
    const user = userEvent.setup();
    const worktree = buildWorktree({ processStatus: "running", pid: 4242 });
    let resolveStop: (worktree: Worktree) => void = () => {};
    const stopped = new Promise<Worktree>((resolve) => {
      resolveStop = resolve;
    });
    server.use(http.post("/api/worktrees/:id/stop", async () => HttpResponse.json(await stopped)));
    const { rerenderWith } = renderList([worktree]);

    await user.click(screen.getByRole("button", { name: "Parar" }));

    expect(await screen.findByRole("button", { name: "Parando…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arrancar" })).not.toBeInTheDocument();

    const stoppedWorktree: Worktree = { ...worktree, processStatus: "stopped", pid: null };
    resolveStop(stoppedWorktree);
    rerenderWith([stoppedWorktree]);

    expect(await screen.findByRole("button", { name: "Arrancar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parando…" })).not.toBeInTheDocument();
  });
});
