import { http, HttpResponse } from "msw";

import type { Project } from "@/features/projects/schemas";

export let projectsStore: Project[] = [];

export function resetProjectsStore(initialProjects: Project[] = []): void {
  projectsStore = [...initialProjects];
}

export const handlers = [
  http.get("/api/projects", () => HttpResponse.json(projectsStore)),

  http.post("/api/projects", async ({ request }) => {
    const body = (await request.json()) as Omit<
      Project,
      "id" | "createdAt" | "repoOwner" | "repoName"
    >;

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
    const patch = (await request.json()) as Partial<Project>;
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

    return HttpResponse.json({
      localPath,
      exists: true,
      isGitRepo: true,
      existingProjectId: existingProject?.id ?? null,
      configFile: null,
    });
  }),
];
