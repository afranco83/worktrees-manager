# 0013. Integración con Pull Requests: endpoint dedicado, sin sumarse a `withGitStatus`/`withDetectedPorts`

- **Estado**: Aceptada
- **Fecha**: 2026-07-21

## Contexto

El DoD de Fase 7 pide que un worktree con PR asociada muestre su estado (abierta/cerrada/mergeada) y enlace directamente a GitHub, con asociación manual o por nombre de rama vía `gh` CLI. A diferencia de `detectedPorts` (Fase 5) y `gitStatus` (Fase 6) — campos derivados calculados en caliente sobre el mismo listado de worktrees, refrescado cada 5 s — el estado de una PR es una **llamada de red a la API de GitHub**, no una comprobación local: tiene coste, latencia y un límite de peticiones real, y además `gh pr view` no puede ejercitarse de forma determinista contra un proceso real en CI (necesita sesión autenticada y un repo real de GitHub, a diferencia de `git`, que sí se levanta contra repos temporales locales).

## Decisión

**Endpoints dedicados**, no una tercera función `withPullRequest()` sumada a la cadena de enriquecimiento que ya usan `GET`/`PATCH`/`start`/`stop`:

- `GET /worktrees/:id/pull-request` — resuelve y devuelve la PR asociada (`{number, state, url} | null`).
- `PATCH /worktrees/:id/pull-request` — persiste un override manual (`prNumber`) y devuelve la PR resuelta.

La resolución usa `worktree.prNumber` (override persistido, mismo rol que `devCommandOverride`) si está seteado; si no, el nombre de la rama — `gh pr view <ref>` acepta ambos indistintamente, y resuelve el repo de GitHub a partir del remoto `origin` del propio directorio (`cwd`), sin que la app tenga que parsear ni persistir la URL del remoto ella misma (`Project.repoOwner`/`repoName`, ya en el schema desde la Fase 2, siguen sin usarse — no hacen falta aquí).

**Interfaz inyectable `GitHubCli`** (`apps/server/src/worktrees/github-cli.ts`), mismo patrón que `TerminalLauncher` (`terminal.ts`, Fase 4/5): `viewPullRequest(cwd, ref)` nunca lanza — cualquier fallo (sin PR asociada, el caso normal para la inmensa mayoría de worktrees, o un fallo real de `gh`) se degrada a `null` sin distinguir motivos ni loguear, porque distinguir "no hay PR" de "gh falló" generaría ruido constante en el caso común. `buildApp(db, { githubCli })` acepta la interfaz como override (decorada en `fastify.githubCli`) — primera vez que `buildApp` expone una dependencia sobreescribible; necesario porque, a diferencia de `processManager` (testeado contra procesos `node` reales de usar y tirar), no hay forma de ejercitar el camino real de `gh` de forma determinista en tests.

**Frontend desacoplado**: `useWorktreePullRequest(worktreeId)` es una query de React Query completamente aparte de `useWorktrees` (que sigue en su propio `refetchInterval: 5000`, solo para lo local), con `refetchInterval: 60000`. El componente `PullRequestBadge` hace su propia llamada por `worktreeId`, no lee un campo del `Worktree`. Tras una asociación manual, `onSuccess` de la mutación actualiza la cache directamente (`setQueryData`), así que el usuario ve el resultado al momento sin esperar al siguiente poll de 60 s.

**Alcance deliberadamente mínimo** (decisión explícita del usuario): solo número, estado y enlace — sin detalle de checks de CI. `gh pr view` expone bastante más (`statusCheckRollup`, `mergeable`...), pero no aporta nada que el usuario haya pedido, y añadiría una superficie de parseo del JSON de `gh` que varía según el origen del check (GitHub Actions vs. integraciones externas) sin ninguna necesidad real detrás.

## Alternativas consideradas

- **Sumar `pullRequest` a `withDetectedPorts`/`withGitStatus`** en los mismos endpoints ya existentes: descartada — todos los tests de integración ya extensivamente ejercitados de esas rutas (`plugin.test.ts`) empezarían a invocar `gh` de verdad contra repos temporales sin remoto de GitHub en cada test, lento y sin aportar nada a esos tests. El caso de `terminal.ts` es distinto: esas rutas apenas se ejercitan con el launcher real en tests de integración (solo el 404), así que no arrastraba el mismo problema.
- **Refresco en el mismo poll de 5 s que `gitStatus`**: descartada por el usuario — un worktree con PR dispararía una llamada a la API de GitHub cada 5 s mientras la vista esté abierta, sin necesidad real y con riesgo de rate limit con varios worktrees.
- **Persistir `repoOwner`/`repoName`** (parseando `git remote get-url origin`) para pasarlos explícitamente a `gh` (`-R owner/repo`): descartada — `gh` ya resuelve esto solo a partir del `cwd`, reimplementar el parseo de la URL del remoto sería duplicar lógica que la propia herramienta ya resuelve, mismo criterio que ya aplica el resto del dominio a `git`.
- **Detalle de checks de CI**: descartada explícitamente por el usuario — "lo único que interesa es la PR como enlace y su estado, no necesitamos información ampliada".

## Consecuencias

- `buildApp()` gana un segundo parámetro de dependencia sobreescribible (`githubCli`, además de `logger`) — precedente a seguir si en el futuro aparece otra integración externa no determinista en CI.
- `GitHubCli`/`systemGitHubCli` en sí (wrapper fino de `execa`) no tiene test directo, mismo criterio que `systemTerminalLauncher`: solo se testea la lógica pura de parseo (`parseGhPrViewOutput`) y el comportamiento de las rutas con el fake inyectado.
- El estado de una PR puede tardar hasta 60 s en reflejarse si cambia en GitHub por una vía externa a esta acción (p. ej. alguien la mergea desde la web mientras el dashboard sigue abierto) — aceptable, coherente con que ya no es información en tiempo real como `processStatus`.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
