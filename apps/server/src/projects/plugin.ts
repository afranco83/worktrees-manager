import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { InvalidProjectPathError } from "../errors.js";
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
      const { exists, isGitRepo } = inspectRepoPath(localPath);
      const existingProject = findProjectByLocalPath(fastify.db, localPath);

      return {
        localPath,
        exists,
        isGitRepo,
        existingProjectId: existingProject?.id ?? null,
        configFile: exists ? readProjectConfigFile(localPath) : null,
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
      const { exists, isGitRepo } = inspectRepoPath(request.body.localPath);

      if (!exists || !isGitRepo) {
        throw new InvalidProjectPathError(
          `${request.body.localPath} no existe o no es un repositorio git`,
        );
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
