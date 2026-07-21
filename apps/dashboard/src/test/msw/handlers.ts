import { http, HttpResponse } from "msw";
import { z } from "zod";

import type { Project } from "@/features/projects/schemas";
import type { AppSettings, TerminalOption } from "@/features/settings/schemas";
import type {
  LogEntry,
  ProjectGitInfo,
  PullRequestInfo,
  Worktree,
} from "@/features/worktrees/schemas";

const createProjectRequestSchema = z.object({
  localPath: z.string(),
  name: z.string(),
  devCommand: z.string(),
  postCreateCommand: z.string().nullable(),
});

const updateProjectRequestSchema = z
  .object({
    name: z.string(),
    devCommand: z.string(),
    postCreateCommand: z.string().nullable(),
  })
  .partial();

const updateWorktreeRequestSchema = z.object({
  devCommandOverride: z.string().nullable(),
});

const updateWorktreePrNumberRequestSchema = z.object({
  prNumber: z.number().int().positive().nullable(),
});

const updateSettingsRequestSchema = z
  .object({
    preferredTerminalCommand: z.string().nullable(),
    portRangeStart: z.number(),
    portRangeEnd: z.number(),
  })
  .partial();

const FAKE_TERMINAL_PRESETS: TerminalOption[] = [
  { name: "Terminal", command: "open -a Terminal {path}" },
  { name: "iTerm2", command: "open -a iTerm {path}" },
];

export let settingsStore: AppSettings = {
  preferredTerminalCommand: null,
  portRangeStart: 3000,
  portRangeEnd: 3999,
};

export function resetSettingsStore(): void {
  settingsStore = { preferredTerminalCommand: null, portRangeStart: 3000, portRangeEnd: 3999 };
}

export let projectsStore: Project[] = [];

export function resetProjectsStore(initialProjects: Project[] = []): void {
  projectsStore = [...initialProjects];
}

function requirePathParam(value: string | readonly string[] | undefined): string {
  if (typeof value !== "string") {
    throw new Error("Se esperaba un único parámetro de ruta");
  }

  return value;
}

const createWorktreeRequestSchema = z.object({
  newBranch: z.string(),
  base: z.discriminatedUnion("type", [
    z.object({ type: z.literal("default") }),
    z.object({ type: z.literal("current") }),
    z.object({ type: z.literal("branch"), branch: z.string() }),
  ]),
});

const DEFAULT_GIT_INFO: ProjectGitInfo = {
  currentBranch: "main",
  defaultBranch: "main",
  branches: ["main"],
};

export let worktreesStore: Record<string, Worktree[]> = {};
export let gitInfoStore: Record<string, ProjectGitInfo> = {};
export let logEntriesStore: Record<string, LogEntry[]> = {};
export let pullRequestByWorktreeId: Record<string, PullRequestInfo | null> = {};
let nextWorktreePort = 4100;

export function resetWorktreesStore(): void {
  worktreesStore = {};
  gitInfoStore = {};
  logEntriesStore = {};
  pullRequestByWorktreeId = {};
  nextWorktreePort = 4100;
}

export function setWorktreePullRequest(
  worktreeId: string,
  pullRequest: PullRequestInfo | null,
): void {
  pullRequestByWorktreeId = { ...pullRequestByWorktreeId, [worktreeId]: pullRequest };
}

export function setProjectGitInfo(projectId: string, gitInfo: ProjectGitInfo): void {
  gitInfoStore = { ...gitInfoStore, [projectId]: gitInfo };
}

function findWorktreeEntry(id: string): { projectId: string; worktree: Worktree } | undefined {
  for (const [projectId, worktrees] of Object.entries(worktreesStore)) {
    const worktree = worktrees.find((candidate) => candidate.id === id);

    if (worktree) {
      return { projectId, worktree };
    }
  }

  return undefined;
}

export const FAKE_HOME = "/home/test";

const FAKE_DIRECTORY_TREE: Record<string, string[]> = {
  [FAKE_HOME]: ["projects"],
  [`${FAKE_HOME}/projects`]: ["my-repo"],
  [`${FAKE_HOME}/projects/my-repo`]: [],
};

export const handlers = [
  http.get("/api/projects", () => HttpResponse.json(projectsStore)),

  http.post("/api/projects", async ({ request }) => {
    const body = createProjectRequestSchema.parse(await request.json());

    if (projectsStore.some((project) => project.localPath === body.localPath)) {
      return HttpResponse.json(
        { error: "Conflict", message: "Ya existe un proyecto con esa ruta", statusCode: 409 },
        { status: 409 },
      );
    }

    const project: Project = {
      ...body,
      id: crypto.randomUUID(),
      repoOwner: null,
      repoName: null,
      createdAt: new Date().toISOString(),
    };

    projectsStore = [...projectsStore, project];

    return HttpResponse.json(project, { status: 201 });
  }),

  http.patch("/api/projects/:id", async ({ params, request }) => {
    const patch = updateProjectRequestSchema.parse(await request.json());
    const existing = projectsStore.find((project) => project.id === params.id);

    if (!existing) {
      return HttpResponse.json(
        { error: "Not Found", message: "Proyecto no encontrado", statusCode: 404 },
        { status: 404 },
      );
    }

    const updated = { ...existing, ...patch };
    projectsStore = projectsStore.map((project) => (project.id === params.id ? updated : project));

    return HttpResponse.json(updated);
  }),

  http.delete("/api/projects/:id", ({ params }) => {
    const existing = projectsStore.find((project) => project.id === params.id);

    if (!existing) {
      return HttpResponse.json(
        { error: "Not Found", message: "Proyecto no encontrado", statusCode: 404 },
        { status: 404 },
      );
    }

    projectsStore = projectsStore.filter((project) => project.id !== params.id);

    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/projects/lookup", ({ request }) => {
    const localPath = new URL(request.url).searchParams.get("localPath") ?? "";
    const existingProject = projectsStore.find((project) => project.localPath === localPath);
    const isGitRepo = !localPath.includes("not-a-git-repo");

    return HttpResponse.json({
      localPath,
      exists: isGitRepo,
      isGitRepo,
      hasCommits: isGitRepo && !localPath.includes("no-commits"),
      isWritable: !localPath.includes("not-writable"),
      existingProjectId: existingProject?.id ?? null,
      configFile: localPath.includes("has-config-file")
        ? { devCommand: "pnpm dev", postCreateCommand: "pnpm db:migrate" }
        : null,
    });
  }),

  http.get("/api/projects/:projectId/git-info", ({ params }) => {
    const projectId = requirePathParam(params.projectId);

    return HttpResponse.json(gitInfoStore[projectId] ?? DEFAULT_GIT_INFO);
  }),

  http.get("/api/projects/:projectId/worktrees", ({ params }) => {
    const projectId = requirePathParam(params.projectId);

    return HttpResponse.json(worktreesStore[projectId] ?? []);
  }),

  http.post("/api/projects/:projectId/worktrees", async ({ params, request }) => {
    const projectId = requirePathParam(params.projectId);
    const body = createWorktreeRequestSchema.parse(await request.json());
    const existing = worktreesStore[projectId] ?? [];

    if (existing.some((worktree) => worktree.branch === body.newBranch)) {
      return HttpResponse.json(
        { error: "Conflict", message: `La rama "${body.newBranch}" ya existe`, statusCode: 409 },
        { status: 409 },
      );
    }

    const worktree: Worktree = {
      id: crypto.randomUUID(),
      projectId,
      branch: body.newBranch,
      path: `/repos/project/.worktrees/${body.newBranch}`,
      port: nextWorktreePort,
      processStatus: "stopped",
      pid: null,
      prNumber: null,
      createdAt: new Date().toISOString(),
      devCommandOverride: null,
      detectedPorts: [],
      gitStatus: { hasUncommittedChanges: false, hasUnpushedCommits: false },
    };
    nextWorktreePort += 1;

    worktreesStore = { ...worktreesStore, [projectId]: [...existing, worktree] };

    return HttpResponse.json(worktree, { status: 201 });
  }),

  http.patch("/api/worktrees/:id", async ({ params, request }) => {
    const id = requirePathParam(params.id);
    const patch = updateWorktreeRequestSchema.parse(await request.json());
    const entry = findWorktreeEntry(id);

    if (!entry) {
      return HttpResponse.json(
        { error: "Not Found", message: "Worktree no encontrado", statusCode: 404 },
        { status: 404 },
      );
    }

    const updated: Worktree = { ...entry.worktree, ...patch };
    worktreesStore = {
      ...worktreesStore,
      [entry.projectId]: worktreesStore[entry.projectId].map((worktree) =>
        worktree.id === id ? updated : worktree,
      ),
    };

    return HttpResponse.json(updated);
  }),

  http.delete("/api/worktrees/:id", ({ params, request }) => {
    const id = requirePathParam(params.id);
    const force = new URL(request.url).searchParams.get("force") === "true";

    for (const [projectId, worktrees] of Object.entries(worktreesStore)) {
      const worktree = worktrees.find((candidate) => candidate.id === id);

      if (!worktree) {
        continue;
      }

      if (worktree.branch.includes("dirty") && !force) {
        return HttpResponse.json(
          {
            error: "Conflict",
            message: "El worktree tiene cambios sin commitear o ficheros sin seguimiento",
            statusCode: 409,
          },
          { status: 409 },
        );
      }

      worktreesStore = {
        ...worktreesStore,
        [projectId]: worktrees.filter((candidate) => candidate.id !== id),
      };

      return new HttpResponse(null, { status: 204 });
    }

    return HttpResponse.json(
      { error: "Not Found", message: "Worktree no encontrado", statusCode: 404 },
      { status: 404 },
    );
  }),

  http.post("/api/worktrees/:id/open-terminal", ({ params }) => {
    const id = requirePathParam(params.id);
    const exists = Object.values(worktreesStore).some((worktrees) =>
      worktrees.some((worktree) => worktree.id === id),
    );

    if (!exists) {
      return HttpResponse.json(
        { error: "Not Found", message: "Worktree no encontrado", statusCode: 404 },
        { status: 404 },
      );
    }

    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/worktrees/:id/start", ({ params }) => {
    const id = requirePathParam(params.id);
    const entry = findWorktreeEntry(id);

    if (!entry) {
      return HttpResponse.json(
        { error: "Not Found", message: "Worktree no encontrado", statusCode: 404 },
        { status: 404 },
      );
    }

    const updated: Worktree = { ...entry.worktree, processStatus: "running", pid: 12345 };
    worktreesStore = {
      ...worktreesStore,
      [entry.projectId]: worktreesStore[entry.projectId].map((worktree) =>
        worktree.id === id ? updated : worktree,
      ),
    };
    logEntriesStore = {
      ...logEntriesStore,
      [id]: [
        {
          id: 1,
          timestamp: new Date().toISOString(),
          stream: "stdout",
          content: "Servidor de desarrollo arrancado",
        },
      ],
    };

    return HttpResponse.json(updated);
  }),

  http.post("/api/worktrees/:id/stop", ({ params }) => {
    const id = requirePathParam(params.id);
    const entry = findWorktreeEntry(id);

    if (!entry) {
      return HttpResponse.json(
        { error: "Not Found", message: "Worktree no encontrado", statusCode: 404 },
        { status: 404 },
      );
    }

    const updated: Worktree = { ...entry.worktree, processStatus: "stopped", pid: null };
    worktreesStore = {
      ...worktreesStore,
      [entry.projectId]: worktreesStore[entry.projectId].map((worktree) =>
        worktree.id === id ? updated : worktree,
      ),
    };

    return HttpResponse.json(updated);
  }),

  http.get("/api/worktrees/:id/logs", ({ params }) => {
    const id = requirePathParam(params.id);

    return HttpResponse.json(logEntriesStore[id] ?? []);
  }),

  http.get("/api/worktrees/:id/pull-request", ({ params }) => {
    const id = requirePathParam(params.id);

    return HttpResponse.json(pullRequestByWorktreeId[id] ?? null);
  }),

  http.patch("/api/worktrees/:id/pull-request", async ({ params, request }) => {
    const id = requirePathParam(params.id);
    const body = updateWorktreePrNumberRequestSchema.parse(await request.json());
    const entry = findWorktreeEntry(id);

    if (!entry) {
      return HttpResponse.json(
        { error: "Not Found", message: "Worktree no encontrado", statusCode: 404 },
        { status: 404 },
      );
    }

    const updatedWorktree: Worktree = { ...entry.worktree, prNumber: body.prNumber };
    worktreesStore = {
      ...worktreesStore,
      [entry.projectId]: worktreesStore[entry.projectId].map((worktree) =>
        worktree.id === id ? updatedWorktree : worktree,
      ),
    };

    // Fixture simple: si el test ya fijó una PR concreta con
    // `setWorktreePullRequest`, se respeta (permite probar estados
    // abierta/cerrada/mergeada); si no, se sintetiza una PR "abierta" con ese
    // número, igual de plausible que lo que devolvería `gh pr view` real.
    const resolved: PullRequestInfo | null =
      body.prNumber == null
        ? null
        : (pullRequestByWorktreeId[id] ?? {
            number: body.prNumber,
            state: "open",
            url: `https://github.com/example/repo/pull/${body.prNumber}`,
          });

    pullRequestByWorktreeId = { ...pullRequestByWorktreeId, [id]: resolved };

    return HttpResponse.json(resolved);
  }),

  http.get("/api/settings", () => HttpResponse.json(settingsStore)),

  http.patch("/api/settings", async ({ request }) => {
    const patch = updateSettingsRequestSchema.parse(await request.json());
    settingsStore = { ...settingsStore, ...patch };

    return HttpResponse.json(settingsStore);
  }),

  http.get("/api/settings/terminal-presets", () =>
    HttpResponse.json({ platform: "darwin", presets: FAKE_TERMINAL_PRESETS }),
  ),

  http.get("/api/filesystem/directories", ({ request }) => {
    const path = new URL(request.url).searchParams.get("path") || FAKE_HOME;
    const children = FAKE_DIRECTORY_TREE[path];

    if (children == null) {
      return HttpResponse.json(
        { error: "Unprocessable Entity", message: `${path} no existe`, statusCode: 422 },
        { status: 422 },
      );
    }

    return HttpResponse.json({
      path,
      parentPath: path === FAKE_HOME ? null : path.split("/").slice(0, -1).join("/"),
      directories: children.map((name) => ({ name, path: `${path}/${name}` })),
    });
  }),
];
