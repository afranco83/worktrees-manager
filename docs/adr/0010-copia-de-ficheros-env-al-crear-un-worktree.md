# 0010. Copia automática de ficheros `.env*` al crear un worktree

- **Estado**: Aceptada
- **Fecha**: 2026-07-18

## Contexto

Verificación manual con el worktree real de `store_demo`: tras resolver la colisión de puertos (ver conversación, fix aplicado directamente en `store_demo`, fuera de este repo), `storefront` y `admin` seguían fallando en el navegador con errores de runtime (`MissingSecret` de Auth.js, un 500 al pedir productos, un `TypeError` en el middleware de `admin` al leer `req.auth.user`). Diagnóstico: el repo principal tenía ficheros `.env` reales en `apps/storefront`, `apps/admin` y `apps/api` (con secretos de verdad), gitignorados por convención (`§Seguridad` del canon: "todo `.env*` en `.gitignore`"). `git worktree add` solo hace checkout de lo versionado, así que el worktree nacía únicamente con los `.env.example` (sí versionados) — cualquier app que dependiera de esos secretos fallaba al arrancar.

Este no es un problema específico de `store_demo`: es estructural para **cualquier** proyecto gestionado por esta app que use `.env` locales (la inmensa mayoría de proyectos Node reales), y hasta ahora no había ningún mecanismo que lo cubriera — mismo tipo de gap que ya se resolvió para `node_modules` (instalación automática, decisión previa a este ADR) pero sin resolver para los propios secretos de entorno.

## Decisión

Al crear un worktree, tras `addWorktree` (con el directorio ya existente en disco) y antes de persistirlo en SQLite, se copian al worktree nuevo todos los ficheros gitignorados del repo principal cuyo nombre sea `.env` o empiece por `.env.`, preservando su ruta relativa (`apps/api/.env` → `apps/api/.env` en el worktree).

La decisión de qué está "realmente ignorado" se delega por completo en `git ls-files --others --ignored --exclude-standard` (`apps/server/src/worktrees/env-files.ts`), no en un matching de `.gitignore` reimplementado a mano — mismo criterio que ya llevó a este proyecto a apoyarse en herramientas dedicadas (`execa`/`tree-kill`, ADR-0005/0007) en vez de reimplementar algo con matices. Esto respeta automáticamente excepciones propias de cada proyecto (p. ej. `!.env.example`) sin que este código necesite saber nada de ellas.

**Best-effort, no fatal**: un fallo al copiar (p. ej. permisos) no aborta la creación del worktree — se loguea (`request.log.warn`) y se continúa. Un worktree sin sus `.env` copiados sigue siendo perfectamente usable (es exactamente el comportamiento de hoy, antes de este ADR); fallar la creación entera por esto sería peor que el problema que resuelve.

## Alternativas consideradas

- **Symlink en vez de copia**: descartado — rompería la independencia de cada worktree (editar el `.env` de uno afectaría a todos) y el objetivo aquí es que cada worktree pueda tener secretos/config distintos si hace falta (p. ej. una `DATABASE_URL` de pruebas para una feature concreta), no solo evitar el trabajo de copiarlos una vez.
- **No hacer nada, documentar que hay que copiarlos a mano**: descartado — el fallo es silencioso y confuso (la app "arranca" pero se rompe al usarla, como se vio en este caso real), y afecta a la inmensa mayoría de proyectos reales.

## Consecuencias

- No hay riesgo nuevo de fuga de secretos: se copian solo dentro de `.worktrees/`, que ya está gitignoreado en el propio repo principal desde su creación (ADR-0005).
- Si el repo principal no tiene ningún `.env` gitignoreado, esto es un no-op silencioso (comportamiento idéntico al de antes de este ADR).

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
