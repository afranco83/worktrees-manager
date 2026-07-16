import { z } from "zod";

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  localPath: z.string(),
  devCommand: z.string(),
  portRangeStart: z.number().int(),
  portRangeEnd: z.number().int(),
  repoOwner: z.string().nullable(),
  repoName: z.string().nullable(),
  createdAt: z.string(),
});

export type Project = z.infer<typeof projectSchema>;

const PORT_RANGE_MESSAGE = "portRangeStart debe ser menor que portRangeEnd";

export const createProjectSchema = z
  .object({
    localPath: z.string().min(1),
    name: z.string().min(1),
    devCommand: z.string().min(1),
    portRangeStart: z.number().int().positive(),
    portRangeEnd: z.number().int().positive(),
  })
  .refine((value) => value.portRangeStart < value.portRangeEnd, {
    message: PORT_RANGE_MESSAGE,
    path: ["portRangeEnd"],
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().min(1),
    devCommand: z.string().min(1),
    portRangeStart: z.number().int().positive(),
    portRangeEnd: z.number().int().positive(),
  })
  .partial()
  .refine(
    (value) =>
      value.portRangeStart == null ||
      value.portRangeEnd == null ||
      value.portRangeStart < value.portRangeEnd,
    { message: PORT_RANGE_MESSAGE, path: ["portRangeEnd"] },
  );

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const projectPathLookupQuerySchema = z.object({
  localPath: z.string().min(1),
});

export type ProjectPathLookupQuery = z.infer<typeof projectPathLookupQuerySchema>;

export const projectPathLookupSchema = z.object({
  localPath: z.string(),
  exists: z.boolean(),
  isGitRepo: z.boolean(),
  existingProjectId: z.string().uuid().nullable(),
  configFile: z
    .object({
      devCommand: z.string(),
      portRangeStart: z.number().int(),
      portRangeEnd: z.number().int(),
    })
    .nullable(),
});

export type ProjectPathLookup = z.infer<typeof projectPathLookupSchema>;

export const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});
