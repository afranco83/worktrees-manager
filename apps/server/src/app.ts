import type Database from "better-sqlite3";
import Fastify, { type FastifyReply } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { Server } from "socket.io";
import { z } from "zod";

import {
  BranchAlreadyExistsError,
  CurrentBranchNotFoundError,
  DefaultBranchNotFoundError,
  DevCommandSpawnError,
  DuplicateProjectPathError,
  ForbiddenDirectoryPathError,
  GitWorktreeOperationError,
  InvalidBranchNameError,
  InvalidDirectoryPathError,
  InvalidProjectConfigFileError,
  InvalidProjectPathError,
  NoFreePortAvailableError,
  NotFoundError,
  TerminalLaunchError,
  WorktreeHasUncommittedChangesError,
  WorktreeProcessAlreadyRunningError,
  WorktreeProcessNotRunningError,
} from "./errors.js";
import { filesystemPlugin } from "./filesystem/plugin.js";
import { projectsPlugin } from "./projects/plugin.js";
import { settingsPlugin } from "./settings/plugin.js";
import { systemGitHubCli, type GitHubCli } from "./worktrees/github-cli.js";
import { pruneAllWorktreeLogs } from "./worktrees/log-repository.js";
import {
  createProcessManager,
  worktreeRoom,
  type ProcessManager,
} from "./worktrees/process-manager.js";
import { resetStaleProcessStates } from "./worktrees/repository.js";
import { worktreesPlugin } from "./worktrees/plugin.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database.Database;
    io: Server;
    processManager: ProcessManager;
    githubCli: GitHubCli;
  }
}

const joinWorktreeRoomSchema = z.string().uuid();

function sendErrorResponse({
  reply,
  statusCode,
  error,
  message,
}: {
  reply: FastifyReply;
  statusCode: number;
  error: string;
  message: string;
}): void {
  reply.code(statusCode).send({ error, message, statusCode });
}

export function buildApp(
  db: Database.Database,
  options?: { logger?: boolean; githubCli?: GitHubCli },
) {
  const app = Fastify({ logger: options?.logger ?? true }).withTypeProvider<ZodTypeProvider>();

  // Al arrancar no hay forma de recuperar un proceso hijo real de una
  // ejecución anterior (viven solo en memoria): se resetea cualquier worktree
  // que no estuviera "stopped" y se aprovecha para podar `log_entries` por si
  // algún worktree acumuló filas por encima del límite antes de un reinicio
  // (ver `process-manager.ts`/ADR-0007).
  resetStaleProcessStates(db);
  pruneAllWorktreeLogs(db);

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("db", db);

  const io = new Server(app.server, { cors: { origin: true } });
  const processManager = createProcessManager({ db, io });
  app.decorate("io", io);
  app.decorate("processManager", processManager);
  app.decorate("githubCli", options?.githubCli ?? systemGitHubCli);

  io.on("connection", (socket) => {
    app.log.info({ socketId: socket.id }, "cliente conectado por WebSocket");

    socket.on("join-worktree", (worktreeId: unknown) => {
      const result = joinWorktreeRoomSchema.safeParse(worktreeId);

      if (result.success) {
        void socket.join(worktreeRoom(result.data));
      }
    });

    socket.on("leave-worktree", (worktreeId: unknown) => {
      const result = joinWorktreeRoomSchema.safeParse(worktreeId);

      if (result.success) {
        void socket.leave(worktreeRoom(result.data));
      }
    });
  });

  // `preClose` (no `onClose`): en `onClose` el servidor HTTP subyacente ya
  // está cerrándose, así que desconectar los sockets ahí llega tarde y cuelga
  // `app.close()` con un cliente conectado (verificado con un test real, ver
  // `socket.test.ts`). `preClose` corre justo antes, documentado por Fastify
  // exactamente para este caso ("open WebSocket connections... must be
  // explicitly terminated for server.close() to complete").
  app.addHook("preClose", async () => {
    io.disconnectSockets(true);
  });

  app.addHook("onClose", async () => {
    await processManager.stopAll();
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(projectsPlugin, { prefix: "/api/projects" });
  app.register(filesystemPlugin, { prefix: "/api/filesystem/directories" });
  app.register(worktreesPlugin, { prefix: "/api" });
  app.register(settingsPlugin, { prefix: "/api/settings" });

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      sendErrorResponse({
        reply,
        statusCode: 400,
        error: "Bad Request",
        message: "La petición no cumple el esquema esperado",
      });
      return;
    }

    if (error instanceof NotFoundError) {
      sendErrorResponse({ reply, statusCode: 404, error: "Not Found", message: error.message });
      return;
    }

    if (
      error instanceof DuplicateProjectPathError ||
      error instanceof BranchAlreadyExistsError ||
      error instanceof WorktreeHasUncommittedChangesError ||
      error instanceof NoFreePortAvailableError ||
      error instanceof WorktreeProcessAlreadyRunningError ||
      error instanceof WorktreeProcessNotRunningError
    ) {
      sendErrorResponse({ reply, statusCode: 409, error: "Conflict", message: error.message });
      return;
    }

    if (error instanceof ForbiddenDirectoryPathError) {
      sendErrorResponse({ reply, statusCode: 403, error: "Forbidden", message: error.message });
      return;
    }

    if (
      error instanceof InvalidProjectPathError ||
      error instanceof InvalidProjectConfigFileError ||
      error instanceof InvalidDirectoryPathError ||
      error instanceof InvalidBranchNameError ||
      error instanceof DefaultBranchNotFoundError ||
      error instanceof CurrentBranchNotFoundError
    ) {
      sendErrorResponse({
        reply,
        statusCode: 422,
        error: "Unprocessable Entity",
        message: error.message,
      });
      return;
    }

    if (
      error instanceof GitWorktreeOperationError ||
      error instanceof TerminalLaunchError ||
      error instanceof DevCommandSpawnError
    ) {
      // A diferencia de los 422 de validación de arriba, este es el fallback
      // genérico de un fallo real de `git`/del sistema (disco lleno, permisos,
      // .git corrupto, ningún emulador de terminal soportado...) — se loguea
      // igual que un 500 para no perder visibilidad operativa, aunque el
      // status que ve el cliente siga siendo 422.
      request.log.error(error);
      sendErrorResponse({
        reply,
        statusCode: 422,
        error: "Unprocessable Entity",
        message: error.message,
      });
      return;
    }

    request.log.error(error);
    sendErrorResponse({
      reply,
      statusCode: 500,
      error: "Internal Server Error",
      message: "Error interno",
    });
  });

  return app;
}
