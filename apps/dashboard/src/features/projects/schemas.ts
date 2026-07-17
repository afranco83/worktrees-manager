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

export const createProjectFormSchema = z.object({
  localPath: z.string().min(1, "Indica la ruta local del repositorio"),
  name: z.string().min(1, "Indica un nombre"),
  devCommand: z.string().min(1, "Indica el comando de arranque"),
});

export type CreateProjectFormValues = z.output<typeof createProjectFormSchema>;

export const updateProjectFormSchema = z.object({
  name: z.string().min(1, "Indica un nombre"),
  devCommand: z.string().min(1, "Indica el comando de arranque"),
});

export type UpdateProjectFormValues = z.output<typeof updateProjectFormSchema>;

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
