import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { terminalPresets } from "../worktrees/terminal.js";
import { getSettings, updateSettings } from "./repository.js";
import {
  appSettingsSchema,
  terminalPresetsResponseSchema,
  updateAppSettingsSchema,
} from "./schemas.js";

export const settingsPlugin: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get("/", { schema: { response: { 200: appSettingsSchema } } }, async () =>
    getSettings(fastify.db),
  );

  fastify.patch(
    "/",
    {
      schema: {
        body: updateAppSettingsSchema,
        response: { 200: appSettingsSchema },
      },
    },
    async (request) => updateSettings(fastify.db, request.body),
  );

  fastify.get(
    "/terminal-presets",
    { schema: { response: { 200: terminalPresetsResponseSchema } } },
    async () => ({ platform: process.platform, presets: terminalPresets(process.platform) }),
  );
};
