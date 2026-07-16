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

const PORT_RANGE_MESSAGE = "El puerto inicial debe ser menor que el puerto final";

export const createProjectFormSchema = z
  .object({
    localPath: z.string().min(1, "Indica la ruta local del repositorio"),
    name: z.string().min(1, "Indica un nombre"),
    devCommand: z.string().min(1, "Indica el comando de arranque"),
    portRangeStart: z.coerce.number().int().positive(),
    portRangeEnd: z.coerce.number().int().positive(),
  })
  .refine((value) => value.portRangeStart < value.portRangeEnd, {
    message: PORT_RANGE_MESSAGE,
    path: ["portRangeEnd"],
  });

export type CreateProjectFormValues = z.output<typeof createProjectFormSchema>;
export type CreateProjectFormInput = z.input<typeof createProjectFormSchema>;

export const updateProjectFormSchema = z
  .object({
    name: z.string().min(1, "Indica un nombre"),
    devCommand: z.string().min(1, "Indica el comando de arranque"),
    portRangeStart: z.coerce.number().int().positive(),
    portRangeEnd: z.coerce.number().int().positive(),
  })
  .refine((value) => value.portRangeStart < value.portRangeEnd, {
    message: PORT_RANGE_MESSAGE,
    path: ["portRangeEnd"],
  });

export type UpdateProjectFormValues = z.output<typeof updateProjectFormSchema>;
export type UpdateProjectFormInput = z.input<typeof updateProjectFormSchema>;

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
