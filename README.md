# Worktrees Manager

Dashboard local para gestionar `git worktrees` de forma visual: crear/borrar worktrees con asignación automática de puerto, arrancar/parar sus entornos de dev con logs en tiempo real, ver su estado de cambios sin commitear y su PR asociada — sustituyendo el ir y venir por terminal.

Pensado para quien trabaja en varias ramas/tareas en paralelo sobre uno o varios repositorios (stack habitual: React / Next.js / TypeScript), priorizando ser funcional, informativo y rápido de usar.

## Funcionalidades

- **Multi-proyecto**: da de alta N repositorios locales, cada uno con su comando de arranque y (opcional) un comando posterior a la creación de cada worktree.
- **Ciclo de vida de worktrees**: crea un worktree desde la rama por defecto, una rama existente o la rama actual; bórralo con confirmación si tiene cambios sin commitear o el entorno de dev sigue levantado.
- **Puerto automático**: cada worktree recibe un puerto libre de un rango global, sin colisiones entre worktrees ni con otros procesos de la máquina; en monorepos se detectan y etiquetan los puertos reales de cada app.
- **Entornos de dev con logs en vivo**: arranca/para el comando de dev de cada worktree y sigue su stdout/stderr en tiempo real, con histórico de la sesión.
- **Aviso de seguridad al borrar**: cambios sin commitear y commits locales sin subir a ningún remoto conocido, visibles antes de borrar un worktree con trabajo pendiente.
- **Integración con Pull Requests**: asociación manual o por nombre de rama vía `gh` CLI, con estado (abierta/cerrada/mergeada) y enlace directo a GitHub.

## Requisitos

- Node.js ≥ 26
- `git`
- [GitHub CLI](https://cli.github.com/) (`gh`), instalada y autenticada, solo si se quiere usar la integración con Pull Requests

## Uso

```bash
npx worktrees-manager
```

o instalado de forma global:

```bash
npm install -g worktrees-manager
worktrees-manager
```

Arranca un único servidor local que sirve el dashboard (por defecto en `http://localhost:4100`) y expone su API. El puerto es configurable:

```bash
npx worktrees-manager --port 4200
# o
PORT=4200 npx worktrees-manager
```

Al arrancar, el proceso imprime en consola la URL del dashboard — no abre el navegador automáticamente (para no sorprender en entornos remotos/SSH).

### Dónde vive cada dato

- **Registro central** (`~/.worktrees-manager/`, fuera de cualquier repo gestionado): proyectos dados de alta, sus worktrees, puertos asignados y logs, en SQLite.
- **Config por proyecto** (`.worktrees-manager.json`, opcional, en la raíz de cada repo gestionado): comando de arranque y comando posterior a la creación. Se lee/crea automáticamente al dar de alta el proyecto desde la UI, y puede comitearse para que viaje con el repo.

## Desarrollo

Monorepo `pnpm` con dos apps: `apps/dashboard` (Vite + React + TypeScript) y `apps/server` (Node.js + Fastify + Socket.io).

```bash
pnpm install
pnpm dev            # dashboard (5173) + server (4100) a la vez
pnpm lint
pnpm typecheck
pnpm test
pnpm build           # build de producción de ambas apps
```

Documentación completa del proyecto:

- [`docs/PROJECT_SPECIFICATION.md`](docs/PROJECT_SPECIFICATION.md) — qué y por qué
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — cómo técnico
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — estado y planificación por fases
- [`docs/adr/`](docs/adr/) — decisiones de arquitectura registradas

## Licencia

[MIT](LICENSE) © Aurelio Franco Fernández
