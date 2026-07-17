import type Database from "better-sqlite3";
import Fastify, { type FastifyReply } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import {
  BranchAlreadyExistsError,
  CurrentBranchNotFoundError,
  DefaultBranchNotFoundError,
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
} from "./errors.js";
import { filesystemPlugin } from "./filesystem/plugin.js";
import { projectsPlugin } from "./projects/plugin.js";
import { settingsPlugin } from "./settings/plugin.js";
import { worktreesPlugin } from "./worktrees/plugin.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database.Database;
  }
}

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

export function buildApp(db: Database.Database, options?: { logger?: boolean }) {
  const app = Fastify({ logger: options?.logger ?? true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("db", db);

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
      error instanceof NoFreePortAvailableError
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

    if (error instanceof GitWorktreeOperationError || error instanceof TerminalLaunchError) {
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
