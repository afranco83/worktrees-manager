# Architecture Decision Records

Decisiones de arquitectura individuales, formato [MADR](https://adr.github.io/madr/) (ver [plantilla](./0000-template.md)). Complementan a `docs/ROADMAP.md`: el ROADMAP narra el progreso cronológico de cada fase, un ADR es atómico e inmutable — una decisión, un archivo, nunca editado después (si la decisión cambia, se crea un ADR nuevo que la sustituye).

A diferencia de otros repos propios sobre el mismo modelo documental, aquí no hay ADRs retroactivos: la carpeta arranca vacía junto con el resto de la documentación (Fase 0), antes de escribir ningún código. Cualquier decisión de arquitectura nueva y significativa (no un detalle de implementación) se documenta con un ADR en el momento en que se toma.

| ADR                                                           | Decisión                                                                                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](./0001-esquema-datos-y-migraciones-sqlite.md)          | Migraciones SQLite hand-rolled + IDs UUID en `projects`/`worktrees`, autoincremental en `log_entries`                                               |
| [0002](./0002-stack-ui-fase-3.md)                             | Preset `base-nova` de shadcn/ui, `standardSchemaResolver` para RHF+Zod v4, router/Zustand diferidos                                                 |
| [0003](./0003-ciclo-de-vida-de-worktrees.md)                  | Solo rama nueva por worktree, resolución de rama por defecto, `execa`, puertos sin `detect-port` + lock/índice único                                |
| [0004](./0004-navegacion-maestro-detalle-con-router.md)       | Navegación maestro-detalle: introducción de `react-router`, proyecto seleccionado en la URL                                                         |
| [0005](./0005-worktrees-anidados-y-abrir-terminal.md)         | Worktrees anidados en `.worktrees/` del proyecto (revisa ADR-0003) + `.gitignore` automático + abrir terminal multiplataforma                       |
| [0006](./0006-ajustes-globales-puertos-y-terminal.md)         | Ajustes globales: terminal preferida (lista curada, sin detección) + rango de puertos único, fix de lock de concurrencia                            |
| [0007](./0007-arranque-parada-y-logs-de-entornos-dev.md)      | Arranque/parada de entornos de dev: registro de procesos por factoría, `tree-kill` sin `detached`, Socket.io por salas, retención acotada de logs   |
| [0008](./0008-deteccion-de-puertos-y-feedback-de-arranque.md) | Detección de puertos reales vía regex sobre logs (no escaneo de SO), evento `process-step`, fix de atribución de `log-entry` por sala               |
| [0009](./0009-comando-de-arranque-por-worktree.md)            | Override de `devCommand` por worktree (texto libre) en vez de checkboxes + orquestación propia por app                                              |
| [0010](./0010-copia-de-ficheros-env-al-crear-un-worktree.md)  | Copia automática de `.env*` gitignoreados al crear un worktree, vía `git ls-files --others --ignored` (no reimplementa el matching de `.gitignore`) |
| [0011](./0011-comando-posterior-a-la-creacion.md)             | Comando posterior a la creación, configurable por proyecto, para bootstrap automático (migrar/seedear una BD local) tras crear cada worktree        |
