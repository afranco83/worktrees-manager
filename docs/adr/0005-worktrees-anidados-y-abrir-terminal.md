# 0005. Worktrees anidados en `.worktrees/` del propio proyecto + abrir terminal multiplataforma

- **Estado**: Aceptada
- **Fecha**: 2026-07-17

## Contexto

ADR-0003 fijó la ubicación en disco de los worktrees como directorio **hermano** del proyecto (`${dirname(localPath)}/${basename(localPath)}.worktrees/<rama>`), para evitar cualquier ambigüedad de anidar un worktree dentro del propio repo que lo contiene. Al usar la app sobre un proyecto real, el usuario reportó que esa ubicación (fuera de la carpeta del proyecto, al mismo nivel que otros repos) genera desorden al navegar por el filesystem, y pidió mover los worktrees a una carpeta `.worktrees/` **dentro** de cada proyecto.

En la misma ronda de verificación manual se detectó también que la card de un worktree solo ofrecía "Borrar" — sin arrancar/parar el entorno de dev (correctamente fuera de alcance: es la Fase 5, todavía no iniciada) ni abrir una terminal en su carpeta (que no estaba en ningún documento de alcance). El usuario pidió añadir esto último ya, contemplando macOS, Linux y Windows.

## Decisión

- **Los worktrees pasan a crearse en `<project.localPath>/.worktrees/<rama>`** (anidado, no hermano). `computeWorktreePath` en `apps/server/src/worktrees/git-worktree.ts` cambia en consecuencia; el nombre del directorio (`.worktrees`) se exporta como constante (`WORKTREES_DIRECTORY_NAME`) para no repetirlo como string suelto.
- **`ensureWorktreesDirectoryIgnored(repoPath)`**, nueva función en el mismo módulo: añade `.worktrees/` al `.gitignore` del proyecto (creándolo si no existe) antes de la primera creación de worktree, idempotente (no duplica la entrada en llamadas sucesivas ni si el repo ya lo ignora con o sin barra final). Se invoca desde el handler `POST /projects/:projectId/worktrees` justo tras calcular la ruta. Sin esto, anidar el worktree dentro del repo ensuciaría el `git status` del proyecto principal con todo el contenido de cada worktree — verificado en vivo con git real antes de implementar el fix (`?? .worktrees/` sin ignorar; nada tras añadir la entrada).
- **Worktrees ya creados bajo la convención antigua (hermana) no se migran**: `worktrees.path` se guarda por fila en el momento de la creación, no se recalcula — siguen siendo válidos y borrables con normalidad. Solo los worktrees nuevos usan la ubicación anidada.
- **Abrir terminal** (`apps/server/src/worktrees/terminal.ts`, endpoint `POST /worktrees/:id/open-terminal`): detecta el SO (`process.platform`) y lanza el emulador de terminal correspondiente apuntando a la carpeta del worktree.
  - **macOS**: `open -a Terminal <path>`.
  - **Windows**: Windows Terminal (`wt -d <path>`) si está instalado; si no, `cmd /c start cmd /K "cd /d <path>"` como fallback.
  - **Linux**: sin un único emulador estándar — se prueban en orden `gnome-terminal`, `konsole`, `xfce4-terminal`, `xterm` (el primero instalado, vía `which`/`where`), con el path pasado como `cwd` del proceso spawneado (más robusto entre emuladores que confiar en flags específicos de cada uno, salvo `--working-directory`/`--workdir` para los tres primeros, que sí lo soportan documentado).
  - El lanzador real (`systemTerminalLauncher`) se inyecta como parámetro con valor por defecto (`TerminalLauncher` interface: `platform`, `commandExists`, `run`), para poder testear la lógica de selección de comando por plataforma sin abrir ventanas reales durante los tests — abrir una terminal de verdad es un efecto de UI de sistema operativo, no lógica de dominio, y no se puede ejecutar en CI (headless).

## Alternativas consideradas

- **Mantener worktrees hermanos (ADR-0003 original)**: descartado tras feedback directo del usuario probando la app sobre un proyecto real — el desorden de navegación pesa más que el riesgo (mitigado) de anidar dentro del repo.
- **Anidar sin gestionar `.gitignore` automáticamente**: descartado — ensuciaría el `git status` del usuario en cada proyecto gestionado, un coste peor que el desorden que se intenta resolver.
- **Detectar y soportar más terminales Linux** (`x-terminal-emulator`, terminales de otros DEs): descartado por YAGNI — los cuatro candidatos cubren los entornos de escritorio Linux más comunes (GNOME, KDE, XFCE, y `xterm` como fallback universal); se amplía si un usuario real lo pide.
- **Mockear el spawn del proceso a nivel de `execa`** en vez de inyectar un `TerminalLauncher`: descartado — la interfaz explícita deja clara la superficie mínima que depende del SO real (qué comando, qué argumentos), en vez de mockear la librería de child-process genérica.

## Consecuencias

- El `.gitignore` de cada proyecto gestionado se modifica automáticamente la primera vez que se crea un worktree — comportamiento nuevo a tener en cuenta si el usuario versiona ese fichero y revisa diffs.
- La cobertura de "abrir terminal" es de comando+argumentos por plataforma (tests unitarios con lanzador falso); que la ventana se abra de verdad se verifica manualmente, igual que cualquier otro flujo de UI de esta app — no hay (ni puede haber razonablemente) test automatizado de extremo a extremo para esto.
- Quien retome logs/arranque de entorno en Fase 5 puede reutilizar el mismo patrón de `TerminalLauncher` (comando inyectable) si ese trabajo también necesita invocar procesos del sistema operativo de forma testeable.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
