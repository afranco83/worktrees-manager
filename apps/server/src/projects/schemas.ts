import { z } from "zod";

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  localPath: z.string(),
  devCommand: z.string(),
  repoOwner: z.string().nullable(),
  repoName: z.string().nullable(),
  createdAt: z.string(),
});

export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({
  localPath: z.string().min(1),
  name: z.string().min(1),
  devCommand: z.string().min(1),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().min(1),
    devCommand: z.string().min(1),
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
  configFile: z
    .object({
      devCommand: z.string(),
    })
    .nullable(),
});

export type ProjectPathLookup = z.infer<typeof projectPathLookupSchema>;

export const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});
