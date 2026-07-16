import type Database from "better-sqlite3";
import Fastify, { type FastifyReply } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import {
  DuplicateProjectPathError,
  ForbiddenDirectoryPathError,
  InvalidDirectoryPathError,
  InvalidProjectConfigFileError,
  InvalidProjectPathError,
  NotFoundError,
} from "./errors.js";
import { filesystemPlugin } from "./filesystem/plugin.js";
import { projectsPlugin } from "./projects/plugin.js";

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

    if (error instanceof DuplicateProjectPathError) {
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
      error instanceof InvalidDirectoryPathError
    ) {
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
