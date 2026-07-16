# 0001. Esquema de datos y migraciones SQLite

- **Estado**: Aceptada
- **Fecha**: 2026-07-16

## Contexto

`ARCHITECTURE.md` §4 dejó un esquema borrador (`Project`, `Worktree`, `LogEntry`) pendiente de formalizar en la Fase 2. Formalizarlo implica dos decisiones: cómo evolucionar el esquema SQLite a lo largo de las fases siguientes sin perder datos ya persistidos, y qué estrategia de identificadores usar en cada tabla.

## Decisión

- **Migraciones hand-rolled**, sin librería externa (`knex`, `umzug`, `drizzle-kit`...): un array TypeScript de migraciones (`apps/server/src/db/migrations.ts`, `{ name, up }`), aplicadas en orden por un runner propio (`apps/server/src/db/migrate.ts`) que trackea las ya aplicadas en una tabla `schema_migrations` y las ejecuta dentro de una transacción. **Solo hacia delante**: sin soporte de rollback/`down`.
- **IDs**: `projects` y `worktrees` usan `TEXT` con UUID v4 (`crypto.randomUUID()` de Node, sin dependencia nueva) — se exponen en la futura API REST/URLs del dashboard y no deben ser secuenciales ni adivinables. `log_entries` usa `INTEGER PRIMARY KEY AUTOINCREMENT` — es un log de alto volumen, de solo-append, donde el orden de inserción es justo el criterio de lectura habitual.

## Alternativas consideradas

- **Librería de migraciones** (`knex`, `umzug`, `drizzle-kit`): añade una dependencia y una capa de abstracción para un caso de uso mínimo (3 tablas, un único consumidor, sin necesidad de rollback). Se descarta por YAGNI/KISS del canon; se reevalúa si el número de migraciones o la complejidad de los cambios de esquema crecen de verdad.
- **IDs autoincrementales para todo**: más simple de escribir, pero en `projects`/`worktrees` expondría el recuento total y permitiría enumeración en la futura API REST — inaceptable incluso en una herramienta local si se llega a exponer en red.

## Consecuencias

- Cambios de esquema futuros se añaden como una entrada nueva al array de migraciones (nunca se edita una ya aplicada); si una migración falla en producción, la corrección es siempre hacia delante (una migración nueva), no un rollback automático.
- Cero dependencias nuevas para persistencia; la lógica de migración es trivial de auditar y de testear (`apps/server/src/db/migrate.test.ts`).
- La política de retención/rotación de `log_entries` (mencionada como pendiente en `ARCHITECTURE.md` §4) sigue sin decidir: el esquema no impone un límite, se resuelve en Fase 5 cuando exista el flujo real de escritura de logs.

---

Un ADR es atómico e inmutable: registra una decisión, no se edita después. Si la decisión cambia, se crea un ADR nuevo que la sustituye (`Superseded by`) y se actualiza el `Estado` de este a `Superseded by [ADR-NNNN]`, dejando el razonamiento original intacto y consultable.
