# 0003. Ciclo de vida de worktrees: alcance, resolución de rama y estrategia de puertos

- **Estado**: Aceptada
- **Fecha**: 2026-07-16

## Contexto

La Fase 4 formaliza el ciclo de vida de worktrees (`docs/PROJECT_SPECIFICATION.md` §2.2): crear a partir de la rama por defecto, una rama concreta o la rama actual del repo principal; asignar puerto libre automáticamente; borrar con confirmación; listar por proyecto. Esto exige, por primera vez en el proyecto, invocar operaciones git que **escriben** en disco (`git worktree add/remove`, hasta ahora solo se había hecho `git rev-parse --verify HEAD` de solo lectura en la Fase 3) y asignar puertos sin colisión, tanto entre worktrees del mismo proyecto como con cualquier otro proceso de la máquina.

## Decisión

- **Solo se crea una rama nueva por worktree** (`git worktree add -b <nuevaRama> <ruta> <baseRef>`). Las tres fuentes del spec (rama por defecto / rama actual / rama concreta) son el **punto de partida** de esa rama nueva, no una rama a reutilizar directamente — git no permite la misma rama en dos worktrees a la vez, así que "usar la rama actual tal cual" no es viable de todas formas. Reutilizar una rama ya existente sin worktree propio queda fuera de alcance.
- **Resolución de "rama por defecto"**: `git symbolic-ref refs/remotes/origin/HEAD` → `refs/heads/main` → `refs/heads/master` → error explícito si ninguna resuelve. **Detached HEAD** en el repo principal se trata como "sin rama actual" (`null`), nunca como si `"HEAD"` fuera un nombre de rama válido.
- **Endpoint previo `GET /api/projects/:projectId/git-info`**: resuelve rama por defecto/actual y lista las ramas locales reales antes de que el usuario rellene el formulario, en vez de que el fallo solo aparezca al enviar.
- **Validación del nombre de rama con el propio git** (`git check-ref-format --branch`) antes de construir cualquier ruta de filesystem con ese nombre — evita que un nombre de rama malicioso o mal formado se use para construir una ruta sin validar.
- **Ubicación en disco**: `${dirname(project.localPath)}/${basename(project.localPath)}.worktrees/<rama>`, sibling al repo principal (nunca anidado dentro del propio repo).
- **`execa`** para `git worktree add`/`remove` (nueva dependencia en `apps/server`): a diferencia del chequeo síncrono de solo exit-code ya existente, aquí el stderr real de git aporta valor (rama ya existe, cambios sin commitear, ruta que ya no es un worktree) y la operación es más pesada — justifica asincronía y una captura de stdout/stderr más ergonómica que `child_process` a pelo.
- **Puertos sin `detect-port`**: helper propio (`net.createServer().listen(port)` + captura de `EADDRINUSE`), excluyendo primero los puertos ya usados por otros worktrees del mismo proyecto (SQLite). Concurrencia entre creaciones simultáneas del mismo proyecto: lock en memoria por `projectId` (cola de promesas, suficiente en una app local mono-proceso) + índice `UNIQUE` global sobre `worktrees.port` como backstop en SQLite (un puerto es un recurso de la máquina, no del proyecto).
- **Borrado**: se apoya en la propia comprobación de seguridad de `git worktree remove` (falla si hay cambios sin commitear) en vez de adelantar el polling de `git status` de la Fase 6; ese fallo se traduce a 409 y la UI ofrece "Forzar borrado" (`--force`). Si el directorio ya no existe (borrado manual fuera de la app), se interpreta como "ya no existe", se ejecuta `git worktree prune` y se borra igualmente la fila, evitando una fila fantasma.

## Alternativas consideradas

- **`detect-port` como dependencia**: descartado — el chequeo real (bind + `EADDRINUSE`) son ~10 líneas, no justifica una dependencia nueva para una comprobación tan simple (YAGNI/KISS).
- **Permitir reutilizar una rama existente sin worktree propio como opción de creación**: descartado por ahora — añade una rama de decisión adicional (¿new branch vs. checkout directo?) sin que el spec la pida explícitamente; se añade si aparece una necesidad real.
- **Adelantar el polling de `git status` (Fase 6) para el borrado**: descartado — `git worktree remove` ya hace esa comprobación de forma nativa y suficiente para el alcance de esta fase; construir un polling propio ahora sería adelantar trabajo de una fase futura sin necesidad.
- **Sin lock de concurrencia, confiar solo en el índice único de SQLite**: descartado — sin el lock, dos peticiones simultáneas ejecutarían igualmente `git worktree add` por duplicado (I/O real) antes de que el índice único rechace la segunda escritura; el lock evita ese trabajo desperdiciado y dos worktrees a medio crear.

## Consecuencias

- Cambios de esquema futuros (el índice único de puertos) se añaden como una migración nueva (`0002_worktrees_port_unique`), nunca editando `0001_init`.
- El lock en memoria por proyecto no sobrevive a un reinicio del proceso ni funciona si en el futuro la app deja de ser mono-proceso (p. ej. varios workers) — aceptable mientras sea una herramienta local de un solo usuario; se revisita si eso cambia.
- Cualquier operación de git nueva que escriba en disco (Fase 5/6/7) puede seguir el mismo patrón: `execa` + traducción de stderr a errores de dominio propios, en vez de intentar adivinar el resultado solo por el exit code.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
