# Worktrees Manager — Especificación del Proyecto

## v1.0

> Evoluciona `SPEC.md` v0.1 (retirado). Este documento es la fuente de verdad para el **qué** y el **por qué** del proyecto. El **cómo** técnico detallado vive en [`ARCHITECTURE.md`](./ARCHITECTURE.md) y la planificación temporal por fases en [`ROADMAP.md`](./ROADMAP.md). Las convenciones de código a seguir durante la implementación están en el `AGENTS.md` canon + capas de stack importadas desde `CLAUDE.md`.

---

## 1. Objetivo

Dashboard local para gestionar `git worktrees` de forma visual y eficiente, pensado para desarrolladores que trabajan en varias ramas/tareas en paralelo sobre uno o varios repositorios. Sustituye el ir y viniendo por terminal (`git worktree add/remove`, comprobar puertos libres, arrancar servidores de dev, mirar el estado de la PR) por un panel único.

No es una herramienta genérica para cualquier stack: se optimiza para el flujo de trabajo habitual del autor (React / Next.js / TypeScript), priorizando que sea **funcional, informativo y rápido de usar** antes que "bonito".

## 2. Alcance de la v1

### 2.1 Gestión de proyectos (multi-proyecto)

- Se pueden registrar N repositorios locales ("proyectos") en el dashboard, cada uno con:
  - Ruta local al repo principal.
  - Comando de arranque del entorno de desarrollo (ej. `npm run dev`, `pnpm dev`), parametrizable con el puerto asignado.
  - Rango de puertos a usar para sus worktrees (ej. 3000–3099).
- **Alta 100% desde la UI**: un botón "+ Añadir proyecto" abre un formulario para indicar la ruta local. Si el repo ya tiene un `.worktrees-manager.json` (ver más abajo), se autorellenan comando de arranque y rango de puertos; si no existe, se rellenan una vez y la propia app escribe el fichero en el repo. Ninguna acción del día a día (añadir proyecto, crear/borrar worktree, levantar/parar entorno) requiere recordar comandos: todo son CTAs del dashboard.

### 2.2 Ciclo de vida de un worktree

- **Crear** un worktree a partir de:
  - La rama por defecto del repo (normalmente `main`).
  - Una rama concreta existente.
  - La rama actual en la que esté situado el repo principal.
- Al crear un worktree se le asigna automáticamente un **puerto libre** dentro del rango del proyecto, comprobando que no esté en uso por otro worktree registrado ni por ningún otro proceso del sistema.
- **Borrar** un worktree (con confirmación si tiene cambios sin commitear o el proceso de dev sigue levantado).
- Listado de todos los worktrees activos por proyecto, con su rama, ruta, puerto y estado.

### 2.3 Integración con Pull Requests

- Asociar manualmente (o detectar automáticamente por nombre de rama) la PR de GitHub correspondiente a un worktree.
- Mostrar su estado: abierta / cerrada / mergeada, checks de CI si están disponibles, y enlace directo a GitHub.
- Integración vía **GitHub CLI (`gh`)**, asumiendo que está instalada y autenticada en la máquina — sin gestión propia de tokens.

### 2.4 Arranque / parada de entornos y logs

- Cada worktree puede **levantarse** (ejecuta el comando de dev configurado con el puerto asignado como variable de entorno) o **pararse** de forma independiente.
- Panel de **logs en tiempo real** (stdout/stderr) del proceso de cada worktree, con histórico consultable de la sesión.
- Estado visual claro: parado / arrancando / corriendo / error.

### 2.5 Estado de cambios sin commitear

- Cada worktree muestra si tiene cambios sin commitear (`git status --porcelain`), refrescado periódicamente (polling), incluyendo un resumen rápido (nº de ficheros modificados/nuevos/borrados).

## 3. Fuera de alcance (v1)

- Soporte genérico para cualquier stack/lenguaje (se asume Node/React/Next/TS en los proyectos gestionados).
- Resolución de conflictos de merge o cualquier operación git avanzada más allá de crear/borrar worktrees.
- Autenticación multi-usuario (es una herramienta local, mono-usuario).
- Despliegue remoto — corre siempre en local.

Estas exclusiones se revisan al cierre del roadmap (ver `ROADMAP.md`); no son una prohibición permanente, sino una decisión consciente de foco.

## 4. Instalación y distribución

La app corre siempre en local (tu máquina), pero gestiona N proyectos a la vez — no hay que "instalar" nada dentro de cada repo gestionado, salvo un fichero de configuración opcional.

- **Distribución**: paquete npm, ejecutable con `npx worktrees-manager` (sin instalación permanente) o instalado globalmente (`npm i -g worktrees-manager`). Arranca el servidor local y sirve el dashboard en `localhost:PUERTO`.
- **Registro central**: `~/.worktrees-manager/` (fuera de cualquier repo gestionado) guarda en SQLite qué rutas de proyecto están dadas de alta, sus worktrees, puertos asignados y logs. Detalle técnico en `ARCHITECTURE.md` §4.
- **Config por proyecto versionada**: cada repo gestionado puede tener un `.worktrees-manager.json` en su raíz con el comando de arranque y el rango de puertos. Al añadir un proyecto desde la UI, si el fichero ya existe se lee y autorellena el formulario; si no existe, la app lo crea a partir de lo que rellenes. Ventaja: la config viaja con el repo (útil entre máquinas), en vez de vivir solo en la BD local del dashboard.
- **Arranque del propio dashboard**: única acción que sigue requiriendo un comando (`npx worktrees-manager`), ya que es un proceso de servidor que debe estar corriendo. Auto-arranque como servicio en segundo plano (launchd/systemd) queda como mejora futura, no como requisito de la v1.

## 5. Stack Tecnológico

| Categoría                  | Tecnología                                                              | Justificación                                                                                       |
| -------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Forma de la app            | Web app local (navegador, `localhost:PUERTO`)                           | Evita la complejidad de empaquetado de Tauri/Electron; encaja con el stack habitual del autor.      |
| Frontend                   | Vite + React + TypeScript                                               | Stack habitual del autor, sin necesidad de SSR/SEO que justifique Next.js.                          |
| Estilos / UI               | Tailwind CSS + shadcn/ui                                                | Componentes con buen aspecto sin inversión de diseño dedicada.                                      |
| Backend                    | Node.js + Fastify                                                       | Expone la API REST y gestiona procesos hijos (arranque/parada de entornos).                         |
| Tiempo real (logs, estado) | WebSockets (Socket.io)                                                  | Streaming de logs y actualizaciones de estado sin polling agresivo desde el cliente.                |
| Persistencia               | SQLite (`better-sqlite3`)                                               | Fichero local único, sin servidor de BD, suficiente para proyectos/worktrees/puertos/logs.          |
| Operaciones git            | `simple-git` / `execa` sobre el `git` del sistema                       | Evita reimplementar git; delega en el binario real instalado.                                       |
| Gestión de puertos         | Comprobación de rango reservado + verificación real (ej. `detect-port`) | Evita colisiones tanto entre worktrees como con otros procesos del sistema.                         |
| Integración PRs            | GitHub CLI (`gh`)                                                       | Sin gestión de tokens propios; se apoya en la sesión ya autenticada del usuario.                    |
| Alta de proyectos          | 100% desde la UI (sin CLI de por medio)                                 | Prioridad de UX: nada de comandos que memorizar para el uso del día a día, todo con botones/CTAs.   |
| Config por proyecto        | Fichero versionado `.worktrees-manager.json` en la raíz de cada repo    | Viaja con el repo entre máquinas; la app lo lee/escribe desde la UI, el usuario no lo edita a mano. |

Detalle de cómo se conectan estas piezas (estructura de carpetas, esquema de datos, diagramas) en `ARCHITECTURE.md`.

## 6. Ideas para futuras fases (backlog, no comprometido)

- Detección automática de la PR asociada por nombre de rama (sin asociación manual).
- Notificaciones cuando cambia el estado de una PR (mergeada, con nuevos comentarios, CI en rojo).
- Plantillas de proyecto reutilizables (comando de arranque, rango de puertos) para añadir nuevos repos más rápido.
- Atajos para abrir el worktree en el editor (VS Code, etc.) directamente desde el dashboard.
- Métricas simples: tiempo de vida medio de un worktree, nº de worktrees activos a lo largo del tiempo.
- Auto-arranque del dashboard como servicio en segundo plano (launchd/systemd) al iniciar sesión.

## 7. Estado del documento

- v0.1 (`SPEC.md`, retirado) — alcance inicial y decisiones de arquitectura acordadas; desglose en fases añadido el 2026-07-14.
- v1.0 — migrado al modelo documental de varios ficheros (`PROJECT_SPECIFICATION.md` + `ARCHITECTURE.md` + `ROADMAP.md` + `docs/adr/`), al arrancar la Fase 1 — Scaffolding (2026-07-16).
