# apps/server

Backend del Worktrees Manager: Node.js + Fastify + Socket.io. Ver `docs/ARCHITECTURE.md` §3-4 para las convenciones de esta app y `docs/ROADMAP.md` para el estado actual del proyecto.

```
pnpm --filter server dev
```

Al arrancar crea (si no existe) el registro central en `~/.worktrees-manager/registry.db` (SQLite, sin esquema todavía — Fase 2).
