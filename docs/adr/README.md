# Architecture Decision Records

Decisiones de arquitectura individuales, formato [MADR](https://adr.github.io/madr/) (ver [plantilla](./0000-template.md)). Complementan a `docs/ROADMAP.md`: el ROADMAP narra el progreso cronológico de cada fase, un ADR es atómico e inmutable — una decisión, un archivo, nunca editado después (si la decisión cambia, se crea un ADR nuevo que la sustituye).

A diferencia de otros repos propios sobre el mismo modelo documental, aquí no hay ADRs retroactivos: la carpeta arranca vacía junto con el resto de la documentación (Fase 0), antes de escribir ningún código. Cualquier decisión de arquitectura nueva y significativa (no un detalle de implementación) se documenta con un ADR en el momento en que se toma.

| ADR                                                  | Decisión                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [0001](./0001-esquema-datos-y-migraciones-sqlite.md) | Migraciones SQLite hand-rolled + IDs UUID en `projects`/`worktrees`, autoincremental en `log_entries` |
