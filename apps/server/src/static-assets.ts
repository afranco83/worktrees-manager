import { existsSync } from "node:fs";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

const API_PATH_PREFIX = "/api/";

/**
 * Sirve el build de producción de `apps/dashboard` (copiado a `publicDir` en
 * el build del paquete, ver `scripts/copy-dashboard-dist.mjs`) desde el mismo
 * origen que la API. En dev (`publicDir` inexistente, Vite sirve el dashboard
 * en su propio puerto) esto es un no-op deliberado.
 */
export function registerStaticAssets(app: FastifyInstance, publicDir: string): void {
  if (!existsSync(publicDir)) {
    return;
  }

  app.register(fastifyStatic, { root: publicDir });

  // Fallback de SPA: cualquier ruta GET que no sea de la API ni un fichero
  // estático real (p. ej. `/projects/abc`, resuelta por `react-router` en el
  // cliente) sirve `index.html` en vez de un 404 — si no, recargar la página
  // en una ruta profunda del dashboard rompería.
  app.setNotFoundHandler((request, reply) => {
    if (request.method !== "GET" || request.url.startsWith(API_PATH_PREFIX)) {
      reply.code(404).send({
        error: "Not Found",
        message: "Ruta no encontrada",
        statusCode: 404,
      });
      return;
    }

    void reply.type("text/html").sendFile("index.html");
  });
}
