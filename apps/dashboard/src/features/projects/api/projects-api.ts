import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import {
  projectPathLookupSchema,
  projectSchema,
  type CreateProjectFormValues,
  type Project,
  type ProjectPathLookup,
  type UpdateProjectFormValues,
} from "../schemas";

export async function fetchProjects(): Promise<Project[]> {
  return z.array(projectSchema).parse(await apiRequest("/api/projects"));
}

export async function fetchProjectPathLookup(localPath: string): Promise<ProjectPathLookup> {
  return projectPathLookupSchema.parse(
    await apiRequest(`/api/projects/lookup?localPath=${encodeURIComponent(localPath)}`),
  );
}

export async function createProject(input: CreateProjectFormValues): Promise<Project> {
  return projectSchema.parse(
    await apiRequest("/api/projects", { method: "POST", body: JSON.stringify(input) }),
  );
}

export async function updateProject({
  id,
  patch,
}: {
  id: string;
  patch: UpdateProjectFormValues;
}): Promise<Project> {
  return projectSchema.parse(
    await apiRequest(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  );
}

export async function deleteProject(id: string): Promise<void> {
  await apiRequest(`/api/projects/${id}`, { method: "DELETE" });
}
