# 0006. Ajustes globales de la app: terminal preferida (lista curada) + rango de puertos único

- **Estado**: Aceptada
- **Fecha**: 2026-07-17

## Contexto

ADR-0005 introdujo "abrir terminal" resolviendo siempre la misma app fija por plataforma (`Terminal.app`, un candidato fijo en Linux, `wt`/`cmd` en Windows). Al usar la app en el día a día, el usuario señaló que no usa la terminal por defecto de su sistema (usa iTerm2 en macOS) y pidió poder elegirla — inicialmente se planteó detectarla en tiempo real entre las apps instaladas, pero el propio usuario simplificó el requisito: una lista estática y curada de las terminales más populares por plataforma es más simple y suficiente, ampliable más adelante si hace falta una que no esté.

En paralelo, el rango de puertos por proyecto (`portRangeStart`/`portRangeEnd`, fijado al dar de alta cada proyecto) había dejado de aportar nada real desde el cierre de la Fase 4: el índice único de `worktrees.port` es global y `listUsedPorts` ya consulta todos los proyectos, así que dos proyectos con rangos solapados nunca colisionaban de verdad — el campo por-proyecto era vestigial. El usuario pidió eliminarlo y sustituirlo por un único rango global de la app.

Ambos apuntan al mismo mecanismo: un dominio de **ajustes globales** de la aplicación, no por proyecto, persistido igual que el resto del registro (SQLite en `~/.worktrees-manager/registry.db`), no un fichero de configuración aparte.

## Decisión

- **Nuevo dominio backend `apps/server/src/settings/`** (`schemas.ts` + `repository.ts` + `plugin.ts`), mismo patrón que `projects`/`worktrees`. Persistencia en una tabla nueva `app_settings` con **fila única forzada** (`CHECK (id = 1)`, sembrada en la propia migración) — no una tabla clave-valor genérica: solo hay tres campos reales hoy (YAGNI). Migraciones `0003_app_settings` (crea + siembra) y `0004_projects_drop_port_range` (`ALTER TABLE projects DROP COLUMN port_range_start/end`), nunca editando `0001_init` (patrón ya establecido en `apps/server/src/db/migrations.ts`).
- **Terminal preferida — lista estática, sin detección real**: `terminalPresets(platform: NodeJS.Platform)` en `apps/server/src/worktrees/terminal.ts` devuelve una función pura y síncrona con las terminales más populares por plataforma (macOS: Terminal/iTerm2/Warp/Alacritty/kitty; Linux: GNOME Terminal/Konsole/XFCE Terminal/Alacritty/kitty/xterm; Windows: Windows Terminal/Símbolo del sistema), cada una como el **comando final ya resuelto** con placeholder `{path}` (ej. `open -a iTerm {path}`). Se almacena así, y no como una referencia estructurada, para que un preset elegido y un comando personalizado se guarden de forma uniforme en `preferred_terminal_command`. `GET /api/settings/terminal-presets` expone esta lista — sin ningún `which`/`open -Ra` en tiempo de petición.
  - `openTerminalAt(path, { preferredCommand, launcher })`: si hay comando preferido, sustituye `{path}` (entre comillas vía `JSON.stringify(path)`, mismo criterio de esfuerzo proporcional que el fallback de Windows ya aceptado en ADR-0005) y lo ejecuta con un método nuevo `runShellCommand` en `TerminalLauncher` (`execa(command, { shell: true })`). Sin preferencia, el fallback automático por plataforma de ADR-0005 sigue intacto. **Este ADR extiende ADR-0005, no lo sustituye.**
- **Puertos globales**: `assignFreePort` en la creación de worktrees pasa a usar `getSettings(fastify.db).portRangeStart/End` en vez de los campos (ya eliminados) del proyecto.
  - **Corrección de concurrencia**: con rango global de verdad, el lock de creación de worktree (`withProjectLock`) dejó de proteger contra la carrera entre proyectos **distintos** compitiendo por el mismo pool de puertos (antes casi nunca chocaba porque los rangos por-proyecto no solían solaparse en la práctica). Se cambió la clave del lock de `project.id` a una constante fija (`GLOBAL_PORT_ALLOCATION_LOCK_KEY`) para todo el bloque de creación — serializar todas las creaciones de worktree de la app (no solo por proyecto) tiene coste irrelevante en un tool local de un único usuario. El índice único (`0002_worktrees_port_unique`) sigue de backstop. Cubierto con un test de concurrencia explícito con dos proyectos distintos creando worktrees a la vez.
- **Frontend**: `apps/dashboard/src/features/settings/` (mismo patrón que `features/projects`/`features/worktrees`), con un diálogo (`SettingsDialog`) disparado desde un icono `Settings` nuevo en la sidebar. El `<Select>` de terminal ofrece "Automático (por defecto del sistema)" (`null`, comportamiento sin cambios), cada preset de la plataforma, y "Personalizado…" que revela un input de texto libre con placeholder `{path}` como válvula de escape para cualquier terminal no listada.

## Alternativas consideradas

- **Detección real de terminales instaladas** (`which`/`open -Ra` en tiempo de petición): era el diseño inicial, descartado a petición explícita del usuario — más simple ofrecer una lista curada y ampliarla cuando haga falta que mantener lógica de detección multiplataforma (con sus propios falsos negativos: una terminal instalada de forma no estándar no se detectaría igual).
- **Tabla de ajustes genérica clave-valor**: descartada por YAGNI, solo hay tres campos reales y una tabla con columnas explícitas es más simple de validar con Zod y de tipar.
- **Mantener rango de puertos por proyecto**: descartado — desde el índice único global de puertos (Fase 4), el campo no prevenía ninguna colisión real; mantenerlo era complejidad sin beneficio.
- **Dejar el lock de creación de worktree con clave por proyecto**: descartado tras revisión de diseño — con rango global, dos proyectos distintos creando worktrees casi simultáneamente podían competir de verdad por el mismo puerto; una clave de lock fija es la corrección mínima y suficiente para un tool de un único usuario.

## Consecuencias

- El formulario de alta/edición de proyecto ya no pide rango de puertos; `.worktrees-manager.json` de proyectos ya migrados con esos campos se lee igual gracias al _strip_ automático de Zod en modo no-estricto (no requiere migración manual del fichero, se autolimpia en la siguiente escritura).
- Toda creación de worktree de la app pasa por un único lock global — coste de serialización aceptado explícitamente, irrelevante para un tool local de un único usuario; si en el futuro esto deja de ser cierto (multi-usuario, remoto), este ADR quedaría `Superseded by`.
- Añadir una terminal nueva a la lista curada es un cambio de una línea en `terminalPresets()`; el input personalizado cubre cualquier caso no contemplado mientras tanto.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
