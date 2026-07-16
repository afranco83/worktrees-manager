import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { InvalidProjectConfigFileError, InvalidProjectPathError } from "../errors.js";
import { readProjectConfigFile, writeProjectConfigFile } from "./config-file.js";
import { inspectRepoPath } from "./repo-path.js";
import {
  deleteProject,
  findProjectByLocalPath,
  insertProject,
  listProjects,
  updateProject,
} from "./repository.js";
import {
  createProjectSchema,
  projectIdParamsSchema,
  projectPathLookupQuerySchema,
  projectPathLookupSchema,
  projectSchema,
  updateProjectSchema,
} from "./schemas.js";

/**
 * Un `.worktrees-manager.json` corrupto no debe tumbar todo el lookup: se trata como
 * "sin config file" para que el usuario pueda seguir dando de alta el proyecto y
 * la app lo regenere al guardar (ver POST/PATCH, que siempre reescriben el fichero).
 */
function tryReadProjectConfigFile(localPath: string): ReturnType<typeof readProjectConfigFile> {
  try {
    return readProjectConfigFile(localPath);
  } catch (error) {
    if (error instanceof InvalidProjectConfigFileError) {
      return null;
    }

    throw error;
  }
}

export const projectsPlugin: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get("/", { schema: { response: { 200: z.array(projectSchema) } } }, async () =>
    listProjects(fastify.db),
  );

  fastify.get(
    "/lookup",
    {
      schema: {
        querystring: projectPathLookupQuerySchema,
        response: { 200: projectPathLookupSchema },
      },
    },
    async (request) => {
      const { localPath } = request.query;
      const { exists, isGitRepo, hasCommits, isWritable } = inspectRepoPath(localPath);
      const existingProject = findProjectByLocalPath(fastify.db, localPath);

      return {
        localPath,
        exists,
        isGitRepo,
        hasCommits,
        isWritable,
        existingProjectId: existingProject?.id ?? null,
        configFile: exists ? tryReadProjectConfigFile(localPath) : null,
      };
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        body: createProjectSchema,
        response: { 201: projectSchema },
      },
    },
    async (request, reply) => {
      const { localPath } = request.body;
      const { exists, isGitRepo, hasCommits, isWritable } = inspectRepoPath(localPath);

      if (!exists || !isGitRepo) {
        throw new InvalidProjectPathError(`${localPath} no existe o no es un repositorio git`);
      }

      if (!hasCommits) {
        throw new InvalidProjectPathError(`${localPath} no tiene ningún commit todavía`);
      }

      if (!isWritable) {
        throw new InvalidProjectPathError(`${localPath} no tiene permisos de escritura`);
      }

      const project = insertProject(fastify.db, request.body);

      writeProjectConfigFile(project.localPath, {
        devCommand: project.devCommand,
        portRangeStart: project.portRangeStart,
        portRangeEnd: project.portRangeEnd,
      });

      reply.code(201);

      return project;
    },
  );

  fastify.patch(
    "/:id",
    {
      schema: {
        params: projectIdParamsSchema,
        body: updateProjectSchema,
        response: { 200: projectSchema },
      },
    },
    async (request) => {
      const project = updateProject(fastify.db, { id: request.params.id, patch: request.body });
      const { devCommand, portRangeStart, portRangeEnd } = request.body;

      if (devCommand != null || portRangeStart != null || portRangeEnd != null) {
        writeProjectConfigFile(project.localPath, {
          devCommand: project.devCommand,
          portRangeStart: project.portRangeStart,
          portRangeEnd: project.portRangeEnd,
        });
      }

      return project;
    },
  );

  fastify.delete("/:id", { schema: { params: projectIdParamsSchema } }, async (request, reply) => {
    deleteProject(fastify.db, request.params.id);
    reply.code(204).send();
  });
};
