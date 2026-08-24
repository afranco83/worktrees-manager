# 0019. Publicación a npm vía Trusted Publishing (OIDC), no `NPM_TOKEN`

- **Estado**: Aceptada
- **Fecha**: 2026-08-24

## Contexto

Esta ADR corrige un único aspecto de [ADR-0017](./0017-automatizacion-release-y-publicacion-npm.md) (el mecanismo de autenticación del paso `npm publish`); el resto de esa decisión (`release-please` en modo manifest, path-scoping a `apps/server`, PAT dedicado para que la Release PR dispare `ci.yml`, changelog, provenance) sigue vigente y no se toca.

Al mergear la primera Release PR real (`v1.0.0`, ver [ADR-0018](./0018-salto-a-version-1-0-0.md)), el job `release-please` creó el tag y la GitHub Release correctamente, pero el job `publish` falló en el paso `npm publish --provenance` con `npm error code EOTP` (_"This operation requires a one-time password"_), después de construir el tarball y firmar el provenance con éxito. El propio log de npm explica la causa: _"npm tokens that bypass 2FA are being restricted for account changes and direct publishing"_ — npm está deprecando activamente que un token (Automation o Granular) pueda publicar sin verificación interactiva desde CI, con independencia del tipo de token creado en `NPM_TOKEN`. El registro nunca llegó a tener `1.0.0` (npm no publica nada parcial si el OTP falla), pero la GitHub Release ya creada quedó desincronizada con lo realmente publicado — el mismo problema que ADR-0016/ADR-0017 querían evitar, ahora en dirección contraria (GitHub dice "publicado", npm no lo tiene).

## Decisión

Sustituir la autenticación por token (`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`) por **npm Trusted Publishing (OIDC)**: el paquete `worktrees-manager` en npmjs.com confía directamente en _este workflow concreto_ (`afranco83/worktrees-manager`, fichero `release-please.yml`) como publicador autorizado, sin ningún secreto de larga vida que gestionar ni rotar. El job `publish` ya tenía `permissions: id-token: write` (para el provenance); con Trusted Publishing configurado en npmjs.com y sin ningún `NODE_AUTH_TOKEN` en el entorno, `npm publish` (≥11.5.1; la runner ya usa `11.19.0`) resuelve el intercambio OIDC automáticamente.

Configuración del Trusted Publisher: acción manual del usuario en npmjs.com (`worktrees-manager` → Settings → Publishing access → Trusted Publisher → GitHub Actions, owner `afranco83`, repo `worktrees-manager`, workflow `release-please.yml`, sin _environment_). El secret `NPM_TOKEN` deja de usarse en el workflow; se puede borrar de `Settings → Secrets and variables → Actions` cuando el usuario quiera (limpieza opcional, ya no aporta nada).

**Reintento del publish para `v1.0.0`**: como `release-please` ya considera esa versión "liberada" (tag + Release ya existen), un push normal a `main` no vuelve a disparar el job `publish` para ella. Se añade un trigger `workflow_dispatch` con un input `tag` al mismo workflow, para poder re-ejecutar solo el job `publish` contra un tag ya creado — mecanismo genérico de recuperación, no un parche de un solo uso: sirve para cualquier fallo futuro del paso de publicación (caída puntual del registro, etc.) sin depender de que `release-please` vuelva a generar una Release PR.

## Alternativas consideradas

- **Insistir con `NPM_TOKEN`** (probar otro tipo de token, o desactivar 2FA en la cuenta): descartada — el aviso de npm indica una restricción de plataforma, no un problema de configuración de este token concreto; desactivar 2FA para esquivarlo sería debilitar la seguridad de la cuenta justo para resolver un problema de seguridad.
- **Volver a publicar `1.0.0` a mano desde la terminal del usuario** (como se hizo con `0.1.0`): descartada — revierte el objetivo entero de esta automatización; se reserva como último recurso, no como solución.
- **Rerun del job fallido en el mismo run** (`gh run rerun --failed`) en vez de `workflow_dispatch`: descartada como mecanismo principal — no hay garantía de que un rerun recoja el workflow YAML corregido (los reruns pueden quedar pinneados al contenido del workflow en el momento del run original), así que no sirve para probar el propio fix ni como mecanismo fiable a futuro.

## Consecuencias

- Menos superficie de credenciales que proteger y rotar: un secret real menos (`NPM_TOKEN`) con capacidad de publicar en el registro público.
- El Trusted Publisher queda atado al nombre exacto del repo y al _path_ del fichero de workflow — renombrar cualquiera de los dos exige reconfigurarlo en npmjs.com, o el siguiente publish volverá a fallar (con un error distinto, de confianza, no de OTP).
- El nuevo trigger `workflow_dispatch` permite a cualquiera con permiso de escritura en el repo disparar manualmente un intento de publish contra un tag arbitrario — mismo nivel de confianza que ya existe hoy para quien puede mergear a `main` (el ruleset `protect-main` ya exige eso), no amplía la superficie de quién puede publicar.
