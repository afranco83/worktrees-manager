import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { CurrentBranchNotFoundError, GitWorktreeOperationError, NotFoundError } from "../errors.js";
import { getProjectById } from "../projects/repository.js";
import { getSettings } from "../settings/repository.js";
import {
  addWorktree,
  assertValidBranchName,
  computeWorktreePath,
  deleteLocalBranch,
  ensureWorktreesDirectoryIgnored,
  getCurrentBranch,
  listLocalBranches,
  removeWorktree,
  resolveDefaultBranch,
} from "./git-worktree.js";
import { assignFreePort } from "./port-allocator.js";
import { withProjectLock } from "./project-lock.js";
import {
  deleteWorktree,
  getWorktreeById,
  insertWorktree,
  listUsedPorts,
  listWorktreesByProject,
} from "./repository.js";
import { openTerminalAt } from "./terminal.js";
import {
  createWorktreeSchema,
  deleteWorktreeQuerySchema,
  projectGitInfoSchema,
  projectIdParamsSchema,
  worktreeIdParamsSchema,
  worktreeSchema,
  type WorktreeBase,
} from "./schemas.js";

/**
 * El rango de puertos es global a la app (ver ADR-0006), no por proyecto: dos
 * creaciones de worktree en proyectos DISTINTOS ahora compiten por el mismo
 * pool, así que la sección crítica de asignación se serializa con una clave
 * fija para toda la app, no con `project.id` — si no, el índice único de
 * `worktrees.port` seguiría evitando datos corruptos, pero un choque entre
 * proyectos distintos pasaría de ser teórico a razonablemente probable.
 */
const GLOBAL_PORT_ALLOCATION_LOCK_KEY = "global-port-allocation";

async function resolveBaseRef(repoPath: string, base: WorktreeBase): Promise<string> {
  if (base.type === "default") {
    return resolveDefaultBranch(repoPath);
  }

  if (base.type === "branch") {
    return base.branch;
  }

  const currentBranch = await getCurrentBranch(repoPath);

  if (currentBranch == null) {
    throw new CurrentBranchNotFoundError(
      "El repositorio principal está en detached HEAD; indica una rama concreta",
    );
  }

  return currentBranch;
}

function requireProject(db: Parameters<typeof getProjectById>[0], projectId: string) {
  const project = getProjectById(db, projectId);

  if (!project) {
    throw new NotFoundError(`No existe un proyecto con id ${projectId}`);
  }

  return project;
}

export const worktreesPlugin: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/projects/:projectId/git-info",
    {
      schema: {
        params: projectIdParamsSchema,
        response: { 200: projectGitInfoSchema },
      },
    },
    async (request) => {
      const project = requireProject(fastify.db, request.params.projectId);

      let currentBranch: string | null;
      let branches: string[];
      let defaultBranch: string | null;

      try {
        [currentBranch, branches, defaultBranch] = await Promise.all([
          getCurrentBranch(project.localPath),
          listLocalBranches(project.localPath),
          resolveDefaultBranch(project.localPath).catch(() => null),
        ]);
      } catch (error) {
        // getCurrentBranch/listLocalBranches no capturan sus propios fallos (a
        // diferencia de resolveDefaultBranch, cuyo caso "sin rama por defecto"
        // es legítimo y se trata arriba): si rechazan, es porque `project.localPath`
        // ya no es un repo git válido (p. ej. se movió/borró tras el alta).
        throw new GitWorktreeOperationError(
          `No se pudo leer la información git de "${project.localPath}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      return { currentBranch, defaultBranch, branches };
    },
  );

  fastify.get(
    "/projects/:projectId/worktrees",
    {
      schema: {
        params: projectIdParamsSchema,
        response: { 200: z.array(worktreeSchema) },
      },
    },
    async (request) => {
      const project = requireProject(fastify.db, request.params.projectId);

      return listWorktreesByProject(fastify.db, project.id);
    },
  );

  fastify.post(
    "/projects/:projectId/worktrees",
    {
      schema: {
        params: projectIdParamsSchema,
        body: createWorktreeSchema,
        response: { 201: worktreeSchema },
      },
    },
    async (request, reply) => {
      const project = requireProject(fastify.db, request.params.projectId);

      const worktree = await withProjectLock(GLOBAL_PORT_ALLOCATION_LOCK_KEY, async () => {
        assertValidBranchName(request.body.newBranch);

        const baseRef = await resolveBaseRef(project.localPath, request.body.base);
        const worktreePath = computeWorktreePath(project, request.body.newBranch);
        ensureWorktreesDirectoryIgnored(project.localPath);
        const settings = getSettings(fastify.db);
        const usedPorts = listUsedPorts(fastify.db);
        const port = await assignFreePort({
          start: settings.portRangeStart,
          end: settings.portRangeEnd,
          usedPorts,
        });

        await addWorktree({
          repoPath: project.localPath,
          worktreePath,
          newBranch: request.body.newBranch,
          baseRef,
        });

        try {
          return insertWorktree(fastify.db, {
            projectId: project.id,
            branch: request.body.newBranch,
            path: worktreePath,
            port,
          });
        } catch (error) {
          // El worktree ya se creó en disco (directorio + rama) pero no se pudo
          // persistir en SQLite (p. ej. carrera de puertos que el índice único
          // detectó): se compensa borrando ambos para no dejar ni un directorio
          // huérfano ni una rama huérfana sin worktree asociado.
          await removeWorktree({ repoPath: project.localPath, worktreePath, force: true }).catch(
            () => undefined,
          );
          await deleteLocalBranch({
            repoPath: project.localPath,
            branch: request.body.newBranch,
          }).catch(() => undefined);

          throw error;
        }
      });

      reply.code(201);

      return worktree;
    },
  );

  fastify.delete(
    "/worktrees/:id",
    {
      schema: {
        params: worktreeIdParamsSchema,
        querystring: deleteWorktreeQuerySchema,
      },
    },
    async (request, reply) => {
      const worktree = getWorktreeById(fastify.db, request.params.id);

      if (!worktree) {
        throw new NotFoundError(`No existe un worktree con id ${request.params.id}`);
      }

      const project = requireProject(fastify.db, worktree.projectId);

      await withProjectLock(project.id, async () => {
        await removeWorktree({
          repoPath: project.localPath,
          worktreePath: worktree.path,
          force: request.query.force,
        });

        deleteWorktree(fastify.db, worktree.id);
      });

      reply.code(204).send();
    },
  );

  fastify.post(
    "/worktrees/:id/open-terminal",
    { schema: { params: worktreeIdParamsSchema } },
    async (request, reply) => {
      const worktree = getWorktreeById(fastify.db, request.params.id);

      if (!worktree) {
        throw new NotFoundError(`No existe un worktree con id ${request.params.id}`);
      }

      const { preferredTerminalCommand } = getSettings(fastify.db);
      await openTerminalAt(worktree.path, { preferredCommand: preferredTerminalCommand });

      reply.code(204).send();
    },
  );
};
