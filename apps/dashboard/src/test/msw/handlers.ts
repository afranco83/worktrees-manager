import { http, HttpResponse } from "msw";
import { z } from "zod";

import type { Project } from "@/features/projects/schemas";

const createProjectRequestSchema = z.object({
  localPath: z.string(),
  name: z.string(),
  devCommand: z.string(),
  portRangeStart: z.number(),
  portRangeEnd: z.number(),
});

const updateProjectRequestSchema = z
  .object({
    name: z.string(),
    devCommand: z.string(),
    portRangeStart: z.number(),
    portRangeEnd: z.number(),
  })
  .partial();

export let projectsStore: Project[] = [];

export function resetProjectsStore(initialProjects: Project[] = []): void {
  projectsStore = [...initialProjects];
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
      configFile: null,
    });
  }),

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
