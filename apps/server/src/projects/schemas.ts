import { z } from "zod";

import { projectConfigFileSchema } from "./config-file.js";

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  localPath: z.string(),
  devCommand: z.string(),
  // `null` = no-op. Se ejecuta una sola vez, automáticamente, justo tras
  // crear cada worktree del proyecto — para bootstrap que `pnpm install`/la
  // copia de `.env` no cubren (migrar una base de datos local, generar un
  // cliente...). Texto libre, igual que `devCommand`: ver ADR-0011.
  postCreateCommand: z.string().nullable(),
  repoOwner: z.string().nullable(),
  repoName: z.string().nullable(),
  createdAt: z.string(),
});

export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({
  localPath: z.string().min(1),
  name: z.string().min(1),
  devCommand: z.string().min(1),
  postCreateCommand: z.string().min(1).nullable().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().min(1),
    devCommand: z.string().min(1),
    postCreateCommand: z.string().min(1).nullable(),
  })
  .partial();

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const projectPathLookupQuerySchema = z.object({
  localPath: z.string().min(1),
});

export type ProjectPathLookupQuery = z.infer<typeof projectPathLookupQuerySchema>;

export const projectPathLookupSchema = z.object({
  localPath: z.string(),
  exists: z.boolean(),
  isGitRepo: z.boolean(),
  hasCommits: z.boolean(),
  isWritable: z.boolean(),
  existingProjectId: z.string().uuid().nullable(),
  configFile: projectConfigFileSchema.nullable(),
});

export type ProjectPathLookup = z.infer<typeof projectPathLookupSchema>;

export const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});
