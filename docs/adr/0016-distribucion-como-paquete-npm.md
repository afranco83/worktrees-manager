# 0016. Distribución como paquete npm: estáticos en el mismo origen, CLI ejecutable, publicación manual

- **Estado**: Aceptada
- **Fecha**: 2026-07-29

## Contexto

Hasta la Fase 8, el proyecto solo se ejecutaba clonado (`pnpm dev`, dashboard en `5173` proxied hacia el server en `4100`). `docs/PROJECT_SPECIFICATION.md` §4 fija desde el inicio el objetivo de distribución: paquete npm ejecutable con `npx worktrees-manager` o instalado globalmente, arrancando un único servidor que sirve el dashboard en `localhost:PUERTO`. `docs/ARCHITECTURE.md` §3 ya anticipaba, sin comprometerse a los detalles, que "en producción, Fase 9 probablemente sirva ambos desde el mismo origen".

Antes de escribir código se acordaron explícitamente con el usuario, vía preguntas puntuales, los tres ejes con más superficie de decisión: (1) publicar de verdad en el registro público de npm, no solo validar con `npm pack`/`npm link` en local; (2) asumir el riesgo de `better-sqlite3` (módulo nativo, compila con node-gyp en la instalación del usuario final) en vez de migrar a una alternativa sin binding nativo; (3) publicación manual, no automatizada en CI.

## Decisión

**Estáticos servidos desde el mismo origen que la API.** `apps/server` sirve el build de producción de `apps/dashboard` (`vite build`) como ficheros estáticos vía `@fastify/static` (`src/static-assets.ts`), con un `setNotFoundHandler` que hace de fallback de SPA: cualquier `GET` que no sea `/api/*` ni un fichero real sirve `index.html` (necesario para que recargar la página en una ruta profunda de `react-router`, p. ej. `/projects/abc`, no rompa); `/api/*` sin match devuelve 404 JSON real. Sustituye al proxy de Vite (`server.proxy["/api"]`) usado en dev, que sigue existiendo solo para ese caso. El directorio servido (`apps/server/public`, gitignorado) se genera copiando `apps/dashboard/dist` en el build (`scripts/copy-dashboard-dist.mjs`), orquestado por un nuevo `pnpm run build` a nivel de raíz que construye primero el dashboard y luego el server.

**Punto de entrada ejecutable.** `apps/server` deja de ser `private` y gana un `bin` (`worktrees-manager`, con shebang `#!/usr/bin/env node` en `src/index.ts` — TypeScript lo preserva en la compilación). El puerto se resuelve con `--port <n>`/`--port=<n>`, la variable de entorno `PORT`, o `4100` por defecto (`src/cli-options.ts`), validado con Zod en el borde (entero, `1-65535`, el rango real de un puerto TCP) — un puerto inválido termina el proceso con un mensaje explícito (`InvalidPortError`) en vez de un error crudo de Node. Al arrancar, imprime la URL del dashboard en consola; no auto-abre el navegador (decisión explícita, para no sorprender en entornos remotos/SSH).

**Metadatos y publicación.** `apps/server` se renombra a `worktrees-manager` (versión inicial `0.1.0`), con `description`/`license`/`repository`/`engines`/`files: ["dist", "public"]`. Verificado con `npm pack` real + `npm install -g` en un prefix y `$HOME` completamente aislados del workspace de pnpm (sin hoisting/caché compartida): `better-sqlite3` resuelve su binario prebuilt sin compilar, el binario global crea el registro (`~/.worktrees-manager/`) y sirve tanto `/health` como el dashboard real. `npm publish` de la `0.1.0` es manual, ejecutado por el usuario — no hay pipeline de CI para ello todavía.

**Renombrado del `package.json` raíz.** Al renombrar `apps/server` a `worktrees-manager`, colisionaba con el nombre ya usado por el `package.json` raíz del monorepo (privado, nunca publicado) — `pnpm --filter worktrees-manager` se volvía ambiguo y ejecutaba los scripts de ambos paquetes a la vez (verificado en directo: un `pnpm --filter worktrees-manager run typecheck` disparaba un `pnpm -r run typecheck` anidado). El raíz pasa a llamarse `worktrees-manager-monorepo`, sin efecto en lo que se publica.

## Alternativas consideradas

- **Mantener el proxy de Vite también en producción** (dos procesos, dashboard servido por su propio servidor): descartada — un paquete npm ejecutable con `npx` solo puede arrancar un proceso de forma simple; dos servidores duplicaría la superficie de arranque/parada y de puertos a gestionar para algo que un único origen resuelve mejor.
- **Sustituir `better-sqlite3` por una alternativa sin binding nativo** (p. ej. sql.js/WASM) para eliminar el riesgo de instalación en la máquina del usuario final: descartada — el riesgo se verificó aceptable en un entorno limpio (prebuilds cubren las plataformas comunes), y migrar el acceso a datos tendría un coste real sin problema demostrado que lo justifique.
- **Publicación automatizada en CI** (tag → `npm publish`): descartada por ahora — con una única versión inicial no compensa el riesgo de un pipeline con permisos de publicación al registro público; se reconsidera si hay más versiones que publicar con frecuencia.
- **Abrir el navegador automáticamente al arrancar**: descartada — un paquete que se puede ejecutar en un entorno remoto/SSH no debería asumir que hay un navegador local que abrir; imprimir la URL es suficiente y no sorprende en ningún entorno.

## Consecuencias

- El dashboard en producción y en dev tienen mecanismos de enrutado distintos (estáticos+fallback SPA vs. proxy de Vite) — cualquier cambio de rutas del lado del servidor debe considerar ambos caminos, aunque los tests (`static-assets.test.ts`) solo ejercitan el de producción.
- El build de `apps/server` depende de que `apps/dashboard` ya esté construido (`copy-dashboard-dist.mjs` falla explícitamente si no encuentra `apps/dashboard/dist`) — no es un build aislado por paquete, hay que usar el `pnpm run build` de la raíz.
- El riesgo de `better-sqlite3` queda asumido, no eliminado: una plataforma sin prebuild disponible obligaría a compilar con node-gyp en la máquina del usuario final, sin red de seguridad si falta el toolchain.
- La publicación manual significa que no hay ninguna garantía automática de que lo que está en `main` coincide con lo último publicado en npm — responsabilidad del usuario al publicar cada versión.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
