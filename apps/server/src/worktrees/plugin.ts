import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { CurrentBranchNotFoundError, GitWorktreeOperationError, NotFoundError } from "../errors.js";
import { getProjectById } from "../projects/repository.js";
import { getSettings } from "../settings/repository.js";
import { copyGitignoredEnvFiles } from "./env-files.js";
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
import { listRecentLogEntries } from "./log-repository.js";
import { assignFreePort } from "./port-allocator.js";
import type { ProcessManager } from "./process-manager.js";
import { withProjectLock } from "./project-lock.js";
import {
  deleteWorktree,
  getWorktreeById,
  insertWorktree,
  listUsedPorts,
  listWorktreesByProject,
  updateWorktreeDevCommandOverride,
} from "./repository.js";
import {
  createWorktreeSchema,
  deleteWorktreeQuerySchema,
  listLogEntriesQuerySchema,
  logEntrySchema,
  projectGitInfoSchema,
  projectIdParamsSchema,
  updateWorktreeSchema,
  worktreeIdParamsSchema,
  worktreeSchema,
  type DetectedPort,
  type WorktreeBase,
} from "./schemas.js";
import { openTerminalAt } from "./terminal.js";

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

function requireWorktree(db: Parameters<typeof getWorktreeById>[0], id: string) {
  const worktree = getWorktreeById(db, id);

  if (!worktree) {
    throw new NotFoundError(`No existe un worktree con id ${id}`);
  }

  return worktree;
}

/**
 * `detectedPorts` no se persiste en SQLite (ver `schemas.ts`): se calcula en
 * caliente a partir del proceso trackeado en memoria, así que cada respuesta
 * que devuelve uno o más worktrees lo sustituye por el valor real.
 */
function withDetectedPorts<T extends { id: string }>(
  processManager: ProcessManager,
  worktree: T,
): T & { detectedPorts: DetectedPort[] } {
  return { ...worktree, detectedPorts: processManager.getDetectedPorts(worktree.id) };
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

      return listWorktreesByProject(fastify.db, project.id).map((worktree) =>
        withDetectedPorts(fastify.processManager, worktree),
      );
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

      // Doble lock: el de `project.id` mantiene la creación mutuamente excluyente
      // con el borrado del mismo proyecto (evita `git worktree add`/`remove`
      // concurrentes sobre el mismo repo); el global serializa la asignación de
      // puerto entre proyectos distintos, ya que el rango es único para toda la
      // app (ver ADR-0006).
      const worktree = await withProjectLock(project.id, () =>
        withProjectLock(GLOBAL_PORT_ALLOCATION_LOCK_KEY, async () => {
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

          // Best-effort: un worktree nuevo es perfectamente usable sin sus
          // `.env*` (el usuario puede copiarlos a mano), así que un fallo aquí
          // no debe tirar abajo la creación entera — solo se deja constancia.
          await copyGitignoredEnvFiles(project.localPath, worktreePath).catch((error: unknown) => {
            request.log.warn(
              { err: error },
              `No se han podido copiar los ficheros .env al worktree ${worktreePath}`,
            );
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
        }),
      );

      reply.code(201);

      return worktree;
    },
  );

  fastify.patch(
    "/worktrees/:id",
    {
      schema: {
        params: worktreeIdParamsSchema,
        body: updateWorktreeSchema,
        response: { 200: worktreeSchema },
      },
    },
    async (request) => {
      const updated = updateWorktreeDevCommandOverride(
        fastify.db,
        request.params.id,
        request.body.devCommandOverride,
      );

      return withDetectedPorts(fastify.processManager, updated);
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
      const worktree = requireWorktree(fastify.db, request.params.id);
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
      const worktree = requireWorktree(fastify.db, request.params.id);
      const project = requireProject(fastify.db, worktree.projectId);

      // Mismo lock por proyecto que crear/borrar, para no abrir una terminal
      // apuntando a un directorio que un borrado concurrente acaba de eliminar.
      await withProjectLock(project.id, async () => {
        const { preferredTerminalCommand } = getSettings(fastify.db);
        await openTerminalAt(worktree.path, { preferredCommand: preferredTerminalCommand });
      });

      reply.code(204).send();
    },
  );

  fastify.post(
    "/worktrees/:id/start",
    { schema: { params: worktreeIdParamsSchema, response: { 200: worktreeSchema } } },
    async (request) => {
      const worktree = requireWorktree(fastify.db, request.params.id);
      const project = requireProject(fastify.db, worktree.projectId);

      await fastify.processManager.start(worktree, project);

      return withDetectedPorts(fastify.processManager, requireWorktree(fastify.db, worktree.id));
    },
  );

  fastify.post(
    "/worktrees/:id/stop",
    { schema: { params: worktreeIdParamsSchema, response: { 200: worktreeSchema } } },
    async (request) => {
      const worktree = requireWorktree(fastify.db, request.params.id);

      await fastify.processManager.stop(worktree.id);

      return withDetectedPorts(fastify.processManager, requireWorktree(fastify.db, worktree.id));
    },
  );

  fastify.get(
    "/worktrees/:id/logs",
    {
      schema: {
        params: worktreeIdParamsSchema,
        querystring: listLogEntriesQuerySchema,
        response: { 200: z.array(logEntrySchema) },
      },
    },
    async (request) => {
      const worktree = requireWorktree(fastify.db, request.params.id);

      return listRecentLogEntries(fastify.db, worktree.id, request.query.limit);
    },
  );
};
