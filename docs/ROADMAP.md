# ROADMAP.md

Desglose por fases con tareas y criterios de aceptación (Definition of Done). Cada fase depende de que la anterior cumpla su DoD. Sustituye a la numeración de `SPEC.md` v0.1 §7 (retirado); mismo orden de fases, formato ampliado con Objetivo/Tareas/DoD y adendas de decisiones que se acumulan al cerrar cada fase.

Seguimiento paralelo en Notion: [Worktrees Manager](https://app.notion.com/p/Worktrees-Manager-39b86295722280229481eb3ff5562a9e).

Estado actual: **Fase 3 — Gestión de proyectos, cerrada el 2026-07-16**; Fase 2 cerrada el 2026-07-16; Fase 1 cerrada el 2026-07-16; Fase 0 cerrada el 2026-07-16.

---

## Fase 0 — Fundamentos y Documentación _(cerrada — 2026-07-16)_

**Objetivo**: dejar asentadas las bases de decisión antes de escribir código.

Tareas:

- [x] Especificación inicial (`SPEC.md` v0.1, 2026-07-14, retirado)
- [x] Desglose en fases (`SPEC.md` v0.1 §7, 2026-07-14)
- [x] Migración al modelo documental de varios ficheros: `PROJECT_SPECIFICATION.md` (qué y por qué) + `ARCHITECTURE.md` (cómo técnico) + este `ROADMAP.md` + `docs/adr/` (2026-07-16)

**DoD**: los 3 documentos + carpeta de ADRs existen, están enlazados entre sí. Sin código todavía. **Cumplido.**

---

## Fase 1 — Scaffolding _(cerrada — 2026-07-16)_

**Objetivo**: preparar la base técnica del proyecto (monorepo, frontend, backend) para poder empezar a construir funcionalidad.

Tareas:

- [x] Monorepo (`pnpm-workspace.yaml`, `package.json` raíz, `.nvmrc` en Node 26 LTS)
- [x] `apps/dashboard`: Vite + React + TypeScript, sin lógica de negocio (placeholder mínimo, sin el boilerplate de demo del template)
- [x] `apps/server`: Fastify + Socket.io (base), sin rutas de negocio (solo `GET /health`)
- [x] ESLint (flat config) + Prettier compartidos en la raíz
- [x] Husky + lint-staged + commitlint (Conventional Commits)
- [x] Bootstrap del registro central `~/.worktrees-manager/` (directorio + conexión SQLite, sin esquema todavía)
- [x] CI base (`ci.yml`): install + lint + typecheck
- [x] Instalación de convenciones compartidas (`afai-conventions-tools`): `CLAUDE.md` + `.claude/settings.json` con el canon + capas nuevas `vite-react-ts`/`node-fastify` (creadas en esta misma fase, ver adenda)

**DoD**: `pnpm install && pnpm lint && pnpm typecheck` en verde desde cero; `apps/dashboard` (Vite, puerto 5173) y `apps/server` (Fastify, puerto 4100) arrancan en local y `GET /health` responde. Ningún paquete tiene código de negocio todavía. **Cumplido**, verificado localmente (lint/typecheck en verde, ambos servidores arrancados y probados manualmente, registro creado en `~/.worktrees-manager/registry.db`).

**Adenda (2026-07-16)**:

- La plantilla oficial de Vite (`react-ts`) ahora trae **oxlint** por defecto en vez de ESLint — se retiró (`.oxlintrc.json` + dependencia) y se sustituyó por el ESLint flat config compartido de la raíz, para mantener consistencia con el resto de repos propios (`store_demo`) y con las convenciones de `afai-conventions-tools`. Se limpiaron también el contenido de demo del template (contadores, logos, enlaces externos) y una aserción no-nula (`!`) en `main.tsx`, prohibida por el canon.
- **Sin Tailwind/shadcn todavía**: aunque `docs/PROJECT_SPECIFICATION.md` §5 los fija como stack de estilos, no son tarea de esta fase (solo scaffolding base) — se añaden cuando haya UI real que estilar.
- `better-sqlite3` requiere aprobación explícita de build scripts nativos de pnpm (`pnpm-workspace.yaml` → `allowBuilds`), igual que `esbuild` (transitiva de Vite/`tsx`) — sin esto, `pnpm install` falla con `ERR_PNPM_IGNORED_BUILDS`.
- **Convenciones compartidas**: ningún plugin existente de `afai-conventions-tools` encajaba con este stack (Vite SPA sin Next.js, backend Fastify — dominio que el canon no cubría). Se crearon dos plugins nuevos en ese repo (`vite-react-ts`, `node-fastify`), sin agentes/skills todavía (mismo criterio que `astro-react`: se añaden cuando haya desarrollo real que los justifique). Ya mergeado en `main` de `afai-conventions-tools` (2026-07-16) — el marketplace remoto ya puede resolver ambos plugins.

---

## Fase 2 — Modelo de datos y persistencia _(cerrada — 2026-07-16)_

**Objetivo**: formalizar el esquema SQLite borrador de `ARCHITECTURE.md` §4.

Tareas:

- [x] Esquema SQLite: `Project`, `Worktree`, `LogEntry` (tablas `projects`, `worktrees`, `log_entries`)
- [x] Migraciones (`apps/server/src/db/migrate.ts`, runner propio — ver [ADR-0001](./adr/0001-esquema-datos-y-migraciones-sqlite.md))

**DoD**: al arrancar `apps/server`, `~/.worktrees-manager/registry.db` tiene las tablas `projects`, `worktrees` y `log_entries` creadas, y volver a aplicar las migraciones no falla ni las duplica. **Cumplido**: la lógica de migración (creación de tablas, idempotencia, atomicidad ante un fallo a mitad) está cubierta por tests Vitest (`apps/server/src/db/migrate.test.ts`, contra una base en memoria); el enlace con el registro real (`openRegistry()` → `~/.worktrees-manager/registry.db`) se verificó manualmente.

**Adenda (2026-07-16)**:

- Se introduce Vitest en `apps/server` (sin DOM, per `ARCHITECTURE.md` §6) y un script `test` a nivel raíz (`pnpm -r --if-present run test`, con `--if-present` porque `apps/dashboard` no tiene tests todavía) + paso nuevo en `ci.yml`.
- Decisiones de esquema (estrategia de migraciones, IDs UUID vs. autoincrementales) documentadas en [ADR-0001](./adr/0001-esquema-datos-y-migraciones-sqlite.md).
- La política de retención/rotación de `log_entries` sigue sin decidir (el esquema no impone límite): se resuelve en Fase 5, cuando exista el flujo real de escritura de logs.

---

## Fase 3 — Gestión de proyectos _(cerrada — 2026-07-16)_

**Objetivo**: alta/gestión de proyectos 100% desde la UI.

Tareas:

- [x] CRUD de proyectos desde la UI (`apps/server/src/projects/`, API REST + `apps/dashboard/src/features/projects/`)
- [x] Lectura/escritura de `.worktrees-manager.json` (`apps/server/src/projects/config-file.ts`)
- [x] Alta de proyecto (autorelleno vía `GET /api/projects/lookup` si el fichero existe, creación si no)

**DoD**: se puede añadir/editar/borrar un proyecto desde el dashboard sin tocar la terminal. **Cumplido**: 29 tests backend (`apps/server`, esquema+migraciones+dominio `projects`, `fastify.inject()`) + 10 tests frontend (`apps/dashboard`, primera vez que se ejecuta Vitest+Testing Library+MSW ahí) en verde; flujo completo (alta con autorelleno, edición con reescritura del fichero, borrado sin tocar el fichero) verificado manualmente en navegador con Playwright contra ambos servidores reales y un repo git de prueba.

**Adenda (2026-07-16)**:

- Primer dominio de negocio de punta a punta: backend organizado en plugins Fastify por dominio (`schemas.ts`/`repository.ts`/`plugin.ts`), Zod vía `fastify-type-provider-zod`, errores de dominio centralizados en `setErrorHandler` (`apps/server/src/app.ts`, extraído de `index.ts` para poder testear con `fastify.inject()`).
- Primera UI real del dashboard: Tailwind v4 + shadcn/ui, TanStack Query, React Hook Form + Zod, `src/features/projects/`. Decisiones documentadas en [ADR-0002](./adr/0002-stack-ui-fase-3.md): preset `base-nova` de shadcn, `standardSchemaResolver` (no `zodResolver`) para RHF+Zod v4, `react-router`/Zustand diferidos a cuando haga falta una segunda vista/estado compartido real.
- **Bug real encontrado en la verificación manual en navegador** (no lo cubría ningún test, porque MSW no replica el parseo de body de Fastify): `apiRequest` (`apps/dashboard/src/lib/api-client.ts`) enviaba siempre `Content-Type: application/json` aunque la petición no tuviera cuerpo (`DELETE`), y Fastify rechazaba esas peticiones con 400/500 (`FST_ERR_CTP_EMPTY_JSON_BODY`). Corregido condicionando la cabecera a la presencia de `body`, con test de regresión (`api-client.test.ts`) que verifica las cabeceras reales por método.
- `docs/ARCHITECTURE.md` §2/§3 actualizado para reflejar el stack y la estructura por dominio ya implementados (antes solo declaraban la intención).
- **Pulido posterior al cierre**: explorador de carpetas reales para el alta de proyecto (`apps/server/src/filesystem/` + `apps/dashboard/src/features/filesystem/`, `GET /api/filesystem/directories`) — ni `<input type="file">` ni la File System Access API exponen la ruta absoluta real de una carpeta elegida en el navegador, así que el backend (con acceso pleno al filesystem de la máquina) es quien lista directorios para que el usuario navegue sin tener que teclear/pegar la ruta a mano. `CreateProjectDialog` implementa la navegación como dos **pasos dentro del mismo `Dialog`** (`step: "form" | "browse"`, sin anidar un segundo diálogo) a petición del usuario, tras probar primero un diálogo anidado — más simple visualmente y sin ambigüedad de foco/Escape entre dos modales abiertos a la vez.
- **Dos controles añadidos a petición del usuario tras probar la primera versión**:
  1. El resto del formulario (`Nombre`, `Comando de arranque`, rango de puertos, botón de envío) queda dentro de un `<fieldset disabled>` hasta que la ruta local se confirma como un repositorio git existente (vía `GET /api/projects/lookup`) — antes se podían rellenar esos campos con una ruta todavía sin validar.
  2. El explorador de carpetas (`GET /api/filesystem/directories`) solo permite navegar dentro del **home del usuario** (`realpathSync(homedir())`, resuelto también a través de symlinks para que no sirvan de escape) — devuelve 403 (`ForbiddenDirectoryPathError`) fuera de ese árbol. Relevante porque `apps/server` escucha en `0.0.0.0`, así que sin este límite el endpoint sería una forma de enumerar el filesystem completo de la máquina desde la red local. El campo de texto libre de "Ruta local" no lleva esta restricción (ahí el usuario escribe una ruta deliberada, que puede vivir fuera del home).
- **Validación ampliada de "¿sirve esta carpeta para worktrees?"** (`apps/server/src/projects/repo-path.ts`, `inspectRepoPath`), a petición del usuario ("si hay más condiciones para que se pueda trabajar con worktree, inclúyelas"): además de ser un repositorio git, ahora comprueba que tenga **al menos un commit** (`git rev-parse --verify HEAD` vía `node:child_process`, primer uso real de git como subproceso en el repo, siguiendo `ARCHITECTURE.md` §3 — "nunca se reimplementa lógica de git en JS") — sin ningún commit no hay rama de la que crear un worktree — y que la carpeta tenga **permisos de escritura** (`git worktree add` necesita escribir metadatos en `.git/`). `GET /api/projects/lookup` devuelve estos motivos por separado (`hasCommits`, `isWritable`) y el formulario de alta muestra un mensaje distinto y accionable para cada caso, en vez de un genérico "ruta inválida".
- 50 tests backend + 14 tests frontend en verde; verificado también manualmente en navegador (autorelleno de nombre/ruta, "Cancelar" vuelve al formulario, sin submits accidentales, campos bloqueados hasta confirmar la ruta, 403 real fuera del home, mensaje específico de "sin commits" y desbloqueo automático tras el primer commit).

---

## Fase 4 — Ciclo de vida de worktrees

**Objetivo**: crear/borrar/listar worktrees con asignación automática de puerto.

Tareas:

- [ ] Crear worktree (`main`, rama concreta o rama actual)
- [ ] Asignación automática de puerto libre
- [ ] Borrar worktree (con confirmación)
- [ ] Listado de worktrees por proyecto

**DoD**: a definir al cerrar Fase 3.

---

## Fase 5 — Entornos de desarrollo y logs

**Objetivo**: arrancar/parar el proceso de dev de cada worktree con logs en tiempo real.

Tareas:

- [ ] Arranque / parada del proceso de dev
- [ ] Streaming de logs en tiempo real (WebSockets)
- [ ] Estado visual: parado / arrancando / corriendo / error

**DoD**: a definir al cerrar Fase 4.

---

## Fase 6 — Estado de cambios sin commitear

**Objetivo**: visibilidad del estado git de cada worktree sin salir del dashboard.

Tareas:

- [ ] Polling de `git status --porcelain`
- [ ] Resumen de ficheros modificados / nuevos / borrados

**DoD**: a definir al cerrar Fase 5.

---

## Fase 7 — Integración con Pull Requests

**Objetivo**: ver el estado de la PR asociada a un worktree sin salir del dashboard.

Tareas:

- [ ] Asociación manual (o por nombre de rama) con `gh` CLI
- [ ] Estado: abierta / cerrada / mergeada, checks de CI
- [ ] Enlace directo a GitHub

**DoD**: a definir al cerrar Fase 6.

---

## Fase 8 — Distribución

**Objetivo**: instalar y ejecutar la herramienta como paquete npm.

Tareas:

- [ ] Paquete npm ejecutable (`npx worktrees-manager`)
- [ ] Instalación global (`npm i -g`)

**DoD**: a definir al cerrar Fase 7.
