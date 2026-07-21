# ROADMAP.md

Desglose por fases con tareas y criterios de aceptación (Definition of Done). Cada fase depende de que la anterior cumpla su DoD. Sustituye a la numeración de `SPEC.md` v0.1 §7 (retirado); mismo orden de fases, formato ampliado con Objetivo/Tareas/DoD y adendas de decisiones que se acumulan al cerrar cada fase.

Seguimiento paralelo en Notion: [Worktrees Manager](https://app.notion.com/p/Worktrees-Manager-39b86295722280229481eb3ff5562a9e).

Estado actual: **Fase 6 — Estado de cambios sin commitear, cerrada el 2026-07-21**; Fase 5 cerrada el 2026-07-20; Fase 4 cerrada el 2026-07-16; Fase 3 cerrada el 2026-07-16; Fase 2 cerrada el 2026-07-16; Fase 1 cerrada el 2026-07-16; Fase 0 cerrada el 2026-07-16.

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

- Se introduce Vitest en `apps/server` (sin DOM, per `ARCHITECTURE.md` §7) y un script `test` a nivel raíz (`pnpm -r --if-present run test`, con `--if-present` porque `apps/dashboard` no tiene tests todavía) + paso nuevo en `ci.yml`.
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
  1. El resto del formulario (`Nombre`, `Comando de arranque`, botón de envío) queda dentro de un `<fieldset disabled>` hasta que la ruta local se confirma como un repositorio git existente (vía `GET /api/projects/lookup`) — antes se podían rellenar esos campos con una ruta todavía sin validar.
  2. El explorador de carpetas (`GET /api/filesystem/directories`) solo permite navegar dentro del **home del usuario** (`realpathSync(homedir())`, resuelto también a través de symlinks para que no sirvan de escape) — devuelve 403 (`ForbiddenDirectoryPathError`) fuera de ese árbol. Relevante porque `apps/server` escucha en `0.0.0.0`, así que sin este límite el endpoint sería una forma de enumerar el filesystem completo de la máquina desde la red local. El campo de texto libre de "Ruta local" no lleva esta restricción (ahí el usuario escribe una ruta deliberada, que puede vivir fuera del home).
- **Validación ampliada de "¿sirve esta carpeta para worktrees?"** (`apps/server/src/projects/repo-path.ts`, `inspectRepoPath`), a petición del usuario ("si hay más condiciones para que se pueda trabajar con worktree, inclúyelas"): además de ser un repositorio git, ahora comprueba que tenga **al menos un commit** (`git rev-parse --verify HEAD` vía `node:child_process`, primer uso real de git como subproceso en el repo, siguiendo `ARCHITECTURE.md` §3 — "nunca se reimplementa lógica de git en JS") — sin ningún commit no hay rama de la que crear un worktree — y que la carpeta tenga **permisos de escritura** (`git worktree add` necesita escribir metadatos en `.git/`). `GET /api/projects/lookup` devuelve estos motivos por separado (`hasCommits`, `isWritable`) y el formulario de alta muestra un mensaje distinto y accionable para cada caso, en vez de un genérico "ruta inválida".
- 50 tests backend + 14 tests frontend en verde; verificado también manualmente en navegador (autorelleno de nombre/ruta, "Cancelar" vuelve al formulario, sin submits accidentales, campos bloqueados hasta confirmar la ruta, 403 real fuera del home, mensaje específico de "sin commits" y desbloqueo automático tras el primer commit).

---

## Fase 4 — Ciclo de vida de worktrees _(cerrada — 2026-07-16)_

**Objetivo**: crear/borrar/listar worktrees con asignación automática de puerto.

Tareas:

- [x] Crear worktree (rama por defecto, rama actual o rama concreta existente, siempre como base de una rama nueva — ver [ADR-0003](./adr/0003-ciclo-de-vida-de-worktrees.md))
- [x] Asignación automática de puerto libre (sin colisiones entre worktrees del mismo proyecto ni a nivel de máquina)
- [x] Borrar worktree (con confirmación, y "Forzar borrado" si hay cambios sin commitear)
- [x] Listado de worktrees por proyecto

**DoD**: desde la UI se crea/borra un worktree real en disco con puerto asignado sin colisiones. **Cumplido**: 41 tests backend nuevos (`apps/server/src/worktrees/`, git real contra repos temporales, incluida una prueba de concurrencia con dos altas simultáneas del mismo proyecto) + 4 tests frontend (`apps/dashboard/src/features/worktrees/`) en verde; verificado manualmente en navegador con Playwright contra un repo git de prueba real: alta desde rama por defecto (directorio y rama confirmados también por `git worktree list` en terminal), segunda alta del mismo proyecto con puerto distinto sin colisión, borrado normal de un worktree limpio, y borrado de un worktree con cambios sin commitear (falla con el mensaje esperado, "Forzar borrado" sí lo elimina).

**Adenda (2026-07-16)**:

- Segundo dominio de negocio de punta a punta (`apps/server/src/worktrees/`), mismo patrón que `projects` (Fase 3): `schemas.ts`/`repository.ts`/`plugin.ts`, más `git-worktree.ts` (git real vía `execa`, nueva dependencia — ver [ADR-0003](./adr/0003-ciclo-de-vida-de-worktrees.md)), `port-allocator.ts` (bind real + `EADDRINUSE`, sin `detect-port`) y `project-lock.ts` (cola de promesas en memoria por `projectId`, backstop de un índice `UNIQUE` en `worktrees.port` a nivel de SQLite).
- **Bug real encontrado en la verificación manual en navegador** (no lo cubría ningún test): `deleteWorktreeQuerySchema` usaba `z.coerce.boolean()` para el query param `force`, y `z.coerce.boolean()` hace `Boolean(valor)` — como cualquier string no vacío es "truthy" en JS, `?force=false` se coaccionaba a `true` y el borrado normal forzaba siempre, sin importar el valor real del parámetro. Corregido con un `z.enum(["true", "false"]).default("false").transform(...)` que compara el texto en vez de coaccionar, con test de regresión explícito para `?force=false`.
- **Segundo bug real encontrado en la misma verificación**: los mensajes de error de git (`git worktree remove`/`add`) salen localizados según el `LANG` del proceso (p. ej. `es_ES.UTF-8` → "no es un árbol de trabajo" en vez de "is not a working tree"), y `git-worktree.ts` distinguía los casos de dominio (rama ya existe, cambios sin commitear) haciendo matching por regex en inglés sobre ese stderr — así que en cualquier máquina con locale no inglés, todos los errores de git caían al genérico `GitWorktreeOperationError` (422) en vez de sus errores específicos (409), rompiendo en particular el flujo de "Forzar borrado". Corregido fijando `LC_ALL=C` en el entorno de cada proceso `git` invocado desde `execa`.
- La política de "solo rama nueva por worktree" (nunca se hace checkout directo de una rama existente sin worktree) y el resto de decisiones de diseño (resolución de rama por defecto, convención de ruta en disco, estrategia de borrado ante worktree con cambios sin commitear o borrado a mano) están documentadas en [ADR-0003](./adr/0003-ciclo-de-vida-de-worktrees.md).
- UI: nuevo primitivo shadcn `select`; `WorktreesDialog` reutiliza el patrón de "un único `Dialog` con pasos internos" de la Fase 3 (`"list" | "create" | {type: "delete", worktree}`) — el paso de borrado se implementó como contenido embebido en el mismo `Dialog` (no un `AlertDialog` anidado), para no reproducir el problema de doble backdrop que ese mismo patrón evitaba en la Fase 3.

**Pulido posterior al cierre**:

- **Navegación maestro-detalle** ([ADR-0004](./adr/0004-navegacion-maestro-detalle-con-router.md)): se sustituye la vista única con diálogos en cascada por `react-router` (proyecto seleccionado en la URL), sidebar de proyectos a la izquierda y panel de detalle a la derecha con la info del proyecto y sus worktrees en formato card; todos los CTA pasan a ser iconos con tooltip (`IconButton`, nuevo primitivo shadcn `tooltip`).
- **Worktrees anidados + abrir terminal** ([ADR-0005](./adr/0005-worktrees-anidados-y-abrir-terminal.md)): los worktrees se crean dentro de `.worktrees/` del propio proyecto (antes hermano del repo, generaba desorden al navegar), con `.gitignore` gestionado automáticamente; nueva acción "Abrir terminal" en cada worktree, multiplataforma (macOS/Linux/Windows).
- **Ajustes globales: terminal preferida + rango de puertos único** ([ADR-0006](./adr/0006-ajustes-globales-puertos-y-terminal.md)): a petición del usuario (usa iTerm2, no la terminal por defecto de macOS), "Abrir terminal" admite un comando preferido elegido de una lista curada por plataforma o uno personalizado, configurable en un nuevo apartado de ajustes globales; el rango de puertos por proyecto (ya vestigial desde que el índice de `worktrees.port` es global) se elimina en favor de un único rango global en ese mismo apartado. Corrección de concurrencia incluida: el lock de creación de worktree pasa de clave por proyecto a clave global, porque con rango global dos proyectos distintos sí pueden competir de verdad por el mismo puerto.
- **Incidente operativo durante la verificación manual**: un `DELETE` por SQL directo contra el registro real (`~/.worktrees-manager/registry.db`), pensado para limpiar un proyecto de prueba, vació la tabla `projects` completa en vez de solo la fila objetivo. Los datos de git (repos/worktrees reales) no se vieron afectados, solo el registro; se recuperó re-dando de alta el proyecto real vía la propia API. Lección aplicada en adelante: cualquier limpieza de datos de prueba contra el registro real se hace únicamente a través de los endpoints HTTP de la propia app, nunca con SQL directo.
- **Dos rondas de revisión sobre el "pulido posterior al cierre"**: `/code-review high` (8 ángulos + verificación de 1 voto) encontró y corrigió 10 hallazgos, entre ellos una inyección de comandos real en "abrir terminal" (`JSON.stringify` usado como citado de shell, no protegía frente a `$()`/backticks) y la pérdida de exclusión mutua entre crear/borrar worktrees del mismo proyecto al introducir el lock global de puertos. `react-common:bug-hunter` sobre el mismo diff encontró un hueco adicional: el fix de citado protegía POSIX pero no `cmd.exe` en Windows (`%VAR%` se expande y `&`/`|`/`<`/`>`/`^`/`(`/`)` son metacaracteres incluso entre comillas dobles) — corregido con el algoritmo de [qntm.org/cmd](https://qntm.org/cmd) (el mismo que usa `cross-spawn`).
- **Mergeada en `main`**: [PR #4](https://github.com/afranco83/worktrees-manager/pull/4), 145 tests backend + 23 tests frontend en verde.

---

## Fase 5 — Entornos de desarrollo y logs _(cerrada — 2026-07-17)_

**Objetivo**: arrancar/parar el proceso de dev de cada worktree con logs en tiempo real.

Tareas:

- [x] Arranque / parada del proceso de dev
- [x] Streaming de logs en tiempo real (WebSockets)
- [x] Estado visual: parado / arrancando / corriendo / error

**DoD**: desde la UI se arranca/para el entorno de dev de un worktree, se ve su estado en tiempo real (parado/arrancando/corriendo/error) y se consultan sus logs (stdout/stderr) en vivo y su histórico de la sesión, sin salir del dashboard. **Cumplido**: decisiones completas en [ADR-0007](./adr/0007-arranque-parada-y-logs-de-entornos-dev.md). 172 tests backend (+27 nuevos: `process-manager.test.ts`, `log-repository.test.ts`, `socket.test.ts`, extensión de `repository.test.ts`/`plugin.test.ts`) + 25 tests frontend en verde.

**Dos bugs reales encontrados por los propios tests, no por revisión manual**:

- `events.once()` trata `'error'` de forma especial al esperar cualquier otro evento (aquí `'spawn'`), y **rechaza** esa promesa si `'error'` llega antes — la carrera inicial para detectar un fallo de arranque dejaba escapar el error crudo de Node en vez de convertirlo en `DevCommandSpawnError`. Corregido añadiendo un manejador de rechazo al `.then()` de `once(child, 'spawn')`.
- Cerrar el servidor con un cliente WebSocket conectado colgaba indefinidamente: `io.close()` cierra internamente el mismo `http.Server` que Fastify ya cierra por su cuenta, y las dos llamadas competían. Corregido con `io.disconnectSockets(true)` en el hook `preClose` de Fastify (documentado explícitamente para este caso) en vez de `onClose`.

Verificado también manualmente en navegador (Playwright) contra un proyecto de prueba real con un `devCommand` de juguete: arrancar y ver el estado pasar a "Corriendo" con el proceso real vivo (`ps`) y la variable `PORT` correcta en el primer log; abrir el diálogo de logs con el proceso ya corriendo y ver tanto el histórico como nuevas líneas en vivo sin huecos ni duplicados; un `devCommand` inválido pasa a "Error" (vía salida no-cero del shell, no vía fallo de spawn — `sh -c` sí arranca, el "comando no encontrado" es la propia salida del shell) con el botón de arrancar disponible de nuevo para reintentar; parar deja el puerto realmente libre, sin proceso residual (`ps` vacío tras el stop).

**Incidente operativo durante esta misma verificación**: se encontraron 3 procesos de servidor (`tsx watch`) corriendo a la vez contra el registro real, acumulados a lo largo de la sesión sin limpiar instancias anteriores — la fila de `store_demo` desapareció de `projects` (verificado con una consulta de solo lectura; los datos de git/worktrees reales no se vieron afectados en ningún momento). Se mataron los procesos redundantes (dejando uno solo activo) y se re-dio de alta `store_demo` vía la propia API, nunca con SQL de escritura — mismo procedimiento que el incidente equivalente de la Fase 4. Lección reforzada: vigilar activamente cuántas instancias del servidor de dev quedan corriendo en sesiones largas, no solo evitar SQL directo.

**Pulido posterior al cierre**, encontrado mediante verificación manual repetida contra un proyecto monorepo real (`store_demo`, turbo con 5 apps):

- **Detección de puertos reales y feedback de arranque** ([ADR-0008](./adr/0008-deteccion-de-puertos-y-feedback-de-arranque.md)): en un monorepo, el único `port` asignado (variable `PORT`) no refleja los puertos reales de cada app — se detectan por regex sobre los logs (`localhost:PUERTO`), sin escaneo de procesos a nivel de SO. Nuevo evento `process-step` distingue "instalando dependencias" de "arrancando el comando de dev". De paso, se encontró y corrigió un bug real preexistente: el payload de `log-entry` no llevaba `worktreeId`, así que un cliente unido a varias salas de worktree a la vez (la lista, que se une a todas para trackear estado) no podía atribuir una línea al worktree correcto.
- **Etiquetado de puertos por app + puertos clicables**: cada puerto detectado se etiqueta con la app que lo anuncia (vía el prefijo de logs de `turbo`, `paquete:tarea:`) y se muestra como enlace real a `http://localhost:PUERTO`.
- **Comando de arranque por worktree** ([ADR-0009](./adr/0009-comando-de-arranque-por-worktree.md)): override de texto libre por worktree para restringir qué apps arrancan en un monorepo (p. ej. `turbo run dev --filter=...`), en vez de checkboxes + orquestación propia por app — decisión explícita de no reimplementar algo que turbo/nx/pnpm workspaces ya resuelven bien.
- **Copia automática de `.env*` gitignoreados al crear un worktree** ([ADR-0010](./adr/0010-copia-de-ficheros-env-al-crear-un-worktree.md)): `git worktree add` solo hace checkout de lo versionado — un worktree nuevo nacía sin secretos reales (auth, `DATABASE_URL`...), encontrado porque `storefront`/`admin` daban error en el navegador. Se delega en `git ls-files --others --ignored` la decisión de qué copiar, sin reimplementar el matching de `.gitignore`.
- **Comando posterior a la creación** ([ADR-0011](./adr/0011-comando-posterior-a-la-creacion.md)): comando opcional por proyecto, ejecutado una sola vez tras crear cada worktree (instala dependencias si hacen falta primero), para bootstrap que `.env` no cubre (migrar/seedear una base de datos local). Compartido vía `.worktrees-manager.json`, comiteado con el propio repo del proyecto, para que el resto del equipo lo herede sin volver a configurarlo.
- **Bug real de CI, no reproducible en local**: un test que hacía que el `devCommand` escribiera 2100 líneas y saliera con `process.exit(0)` fallaba solo en el runner de CI (más lento/con scheduling distinto). Causa real doble: (1) el código de producción escuchaba `'exit'` en vez de `'close'` del proceso hijo, y Node no garantiza que los streams de stdio hayan terminado de emitir datos en `'exit'`; (2) el propio script del test llamaba a `process.exit()` sin esperar a que sus escrituras a stdout ya encoladas se vaciaran al pipe (riesgo documentado explícitamente por Node). Corregidos ambos.
- Verificado en vivo, de extremo a extremo, contra un worktree real de `store_demo`: los 5 puertos detectados y etiquetados correctamente, override de comando restringiendo apps arrancadas, worktree nuevo con `.env` copiados y base de datos migrada+sembrada sin ningún paso manual, `storefront`/`admin` cargando sin errores en el navegador.
- **Mergeada en `main`**: [PR #5](https://github.com/afranco83/worktrees-manager/pull/5), 217 tests backend + 31 tests frontend en verde.

---

## Fase 6 — Estado de cambios sin commitear _(cerrada — 2026-07-21)_

**Objetivo**: visibilidad del estado git de cada worktree sin salir del dashboard, para evitar borrar un worktree con trabajo pendiente sin darse cuenta.

Tareas:

- [x] Polling del estado git de cada worktree
- [x] Aviso de seguridad ante el borrado (cambios sin commitear / commits sin subir)

**DoD**: cada worktree listado muestra si tiene cambios sin commitear y/o commits locales sin subir a ningún remoto conocido, tanto en su card como en el diálogo de confirmación de borrado, sin salir del dashboard. **Cumplido**: decisiones completas en [ADR-0012](./adr/0012-estado-git-sin-commitear.md). 230 tests backend (+13 nuevos: `git-status.test.ts`, extensión de `plugin.test.ts`/`git-worktree.test.ts`) + 36 tests frontend en verde.

**Cambio de enfoque durante la propia implementación**: el DoD original (y la tarea equivalente en Notion) pedía un "resumen numérico" de ficheros modificados/nuevos/borrados — implementado una primera vez y descartado después de que el usuario señalara que un número de cambios no ayuda a decidir nada por sí solo. El objetivo real, redirigido por el propio usuario, es más concreto: avisar antes de que se borre un worktree con trabajo pendiente. Esto separa dos señales distintas: cambios sin commitear (ya bloqueados al borrar desde la Fase 4, pero invisibles hasta el propio intento) y commits sin subir a ningún remoto (sin ninguna protección previa).

**Decisión técnica**: "sin subir" se compara contra `origin/<rama>` si existe copia remota conocida, o contra el **commit base** persistido al crear cada worktree (`worktrees.base_commit_sha`, migración `0007`) si no la hay — evita aproximar contra la rama por defecto, que puede no compartir historia reciente con la base real del worktree. Cómputo on-demand en cada respuesta (mismo patrón que `detectedPorts` de la Fase 5), no polling+push por socket en el backend: el origen del cambio es siempre externo a la app, así que un timer de servidor no tendría ninguna fuente real de la que colgarse — el "polling" real es un `refetchInterval` de 5 s en el frontend.

**Corrección incidental encontrada en el mismo cambio**: el diálogo de confirmación de borrado afirmaba que también se eliminaba la rama del worktree — no es así, `DELETE /worktrees/:id` nunca borra la rama (sobrevive en el repo). Corregido el texto.

Verificado manualmente en navegador (Playwright) contra un worktree real de `store_demo` (creado antes de esta fase: cambios sin commitear detectados correctamente, "sin subir" degradado a sin aviso al no tener `base_commit_sha` persistido, en vez de arriesgar un falso positivo) y, de extremo a extremo, contra un repo temporal desechable: worktree recién creado sin ningún aviso → commit hecho fuera del dashboard sin remoto configurado → badge "Commits sin subir" en ≤5 s sin recargar la página → mismo aviso visible en el diálogo de borrado.

**Mergeada en `main`**: [PR #6](https://github.com/afranco83/worktrees-manager/pull/6), 230 tests backend + 36 tests frontend en verde.

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
