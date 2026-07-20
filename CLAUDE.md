# CLAUDE.md

Este archivo da a Claude Code el contexto operativo de este repositorio. Las convenciones de código detalladas viven en documentos externos, compartidos con otros repos propios sobre stacks afines vía el marketplace [`afai-conventions-tools`](https://github.com/afranco83/afai-conventions-tools) — léelos antes de escribir o modificar código; son la fuente de verdad y aplican también a otras herramientas de codificación, no solo a Claude Code:

@~/Projects/afai-conventions-tools/AGENTS.md

@~/Projects/afai-conventions-tools/plugins/vite-react-ts/AGENTS.md

@~/Projects/afai-conventions-tools/plugins/node-fastify/AGENTS.md

## Qué es este proyecto

Dashboard local para gestionar `git worktrees` de forma visual: crear/borrar worktrees con asignación automática de puerto, arrancar/parar sus entornos de dev con logs en tiempo real, ver su estado de cambios sin commitear y su PR asociada — sustituyendo el ir y venir por terminal. Contexto completo en `docs/PROJECT_SPECIFICATION.md`, `docs/ARCHITECTURE.md` y `docs/ROADMAP.md`.

**Estado actual: Fase 5 — Entornos de desarrollo y logs, cerrada y mergeada en `main`** ([PR #5](https://github.com/afranco83/worktrees-manager/pull/5), `docs/ROADMAP.md`). Próxima fase: **Fase 6 — Estado de cambios sin commitear** (visibilidad del `git status` de cada worktree sin salir del dashboard). Fases 0-5 cerradas: documentación, scaffolding, modelo de datos, gestión de proyectos, ciclo de vida de worktrees y arranque/parada de entornos de dev con logs en tiempo real (con detección de puertos en monorepos, comando de arranque por worktree, copia automática de `.env` y comando posterior a la creación añadidos como pulido posterior al cierre de la Fase 5 — ver `docs/ROADMAP.md` para el detalle y los ADR-0007 a ADR-0011).

Stack: Vite + React + TypeScript (SPA, `apps/dashboard`) + Node.js + Fastify + Socket.io (`apps/server`), monorepo `pnpm` sin Turborepo (solo 2 apps, sin packages compartidos previstos en el alcance de v1). Detalle completo en `docs/ARCHITECTURE.md`.

## Cómo trabajar en este repo

- Antes de implementar algo, comprueba en `docs/ROADMAP.md` en qué fase estamos y qué tareas de esa fase siguen pendientes.
- Sigue el canon + las dos capas de stack importadas arriba al pie de la letra. `node-fastify` es la primera capa de backend del marketplace: si una convención no encaja con este proyecto en concreto, se corrige ahí (o en `docs/ARCHITECTURE.md` si es una decisión propia de este repo, no general del stack).
- No adelantes trabajo de fases futuras (p. ej. no montes el polling de `git status` de la Fase 6 mientras no se pida explícitamente) salvo que el usuario lo pida explícitamente.
- Comandos: `pnpm install`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter dashboard dev`, `pnpm --filter server dev` (o `pnpm dev` para ambos a la vez).
- Cualquier decisión de arquitectura nueva y significativa se documenta con un ADR en `docs/adr/` en el momento en que se toma (ver `docs/adr/README.md`).
- **Mejora continua activa**: siempre que una decisión tomada durante el trabajo pueda derivar en una actualización del canon/capas de `afai-conventions-tools` o del propio roadmap/arquitectura, se propone reflejarla en el documento correspondiente en el momento, no se deja pendiente.

## Multitasking con git worktrees

El trabajo en paralelo sobre distintos frentes (fases, features, spikes) se hace en worktrees separados, no cambiando de rama sobre un único directorio con cambios a medio commitear — coherente con el propio propósito de esta herramienta (`docs/ARCHITECTURE.md` §8).

- Usa `EnterWorktree`/`ExitWorktree` (o `isolation: "worktree"` al lanzar un subagente con `Agent`) cuando el trabajo sea razonablemente independiente y se beneficie de aislamiento del resto del repo.
- No asumas que el working directory activo es el único estado relevante del repo — puede haber otros worktrees con trabajo en curso.

## Repo remoto

[github.com/afranco83/worktrees-manager](https://github.com/afranco83/worktrees-manager). Misma cautela que en cualquier otro repositorio para operaciones de `git` de alcance amplio o difícil de revertir (`push --force`, `reset --hard`, reescritura de historial): confirmación explícita del usuario antes de ejecutarla.
