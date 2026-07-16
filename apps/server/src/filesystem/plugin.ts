import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { listDirectories } from "./list-directories.js";
import { directoryListingSchema, listDirectoriesQuerySchema } from "./schemas.js";

export const filesystemPlugin: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        querystring: listDirectoriesQuerySchema,
        response: { 200: directoryListingSchema },
      },
    },
    async (request) => listDirectories(request.query.path),
  );
};
