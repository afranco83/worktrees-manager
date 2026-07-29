import { useEffect, useRef, useState } from "react";

import type { Worktree } from "../schemas";

// El backend marca `processStatus: "running"` en cuanto el proceso hace
// `spawn` con éxito, sin esperar a que el `devCommand` esté realmente
// escuchando (ver `process-manager.ts`) — para un monorepo con varias apps
// eso puede tardar varios segundos más. `detectedPorts` sí es una señal
// positiva de que algo real está arriba (se rellena al parsear un puerto en
// los logs, ver ADR-0007/0008), así que se usa como proxy de "listo de
// verdad". Un timeout evita esperar para siempre en un `devCommand` que no
// imprime ninguna línea reconocible (p. ej. sin `localhost:<puerto>`).
const FIRST_PORT_DETECTION_TIMEOUT_MS = 10_000;

/**
 * `true` mientras el worktree está genuinamente arrancando: o bien el propio
 * backend lo marca como "starting", o la mutación de arranque de esta pestaña
 * sigue en curso, o ya está "running" pero todavía sin ningún puerto real
 * detectado (ver `FIRST_PORT_DETECTION_TIMEOUT_MS` arriba).
 *
 * `worktree` es opcional para poder llamarse siempre en el mismo orden desde
 * la vista de detalle, que sigue montada mientras `useWorktrees` todavía no
 * ha resuelto — antes de tener el worktree real, siempre devuelve `false`.
 */
export function useIsWorktreeStarting(
  worktree: Worktree | undefined,
  isStartMutationPending: boolean,
): boolean {
  const isTransitioning = worktree?.processStatus === "starting";

  // El efecto solo arranca la espera justo después de una transición a
  // "running" propia (nunca para un worktree que ya estaba corriendo al
  // montar el componente). El AND con el estado actual de más abajo hace
  // innecesario resetear el estado a mano en el resto de casos, así que el
  // cuerpo del efecto no llama a `setState` fuera del timeout.
  const [isWaitingSinceStart, setIsWaitingSinceStart] = useState(false);
  const previousProcessStatusRef = useRef(worktree?.processStatus);

  useEffect(() => {
    const previousProcessStatus = previousProcessStatusRef.current;
    previousProcessStatusRef.current = worktree?.processStatus;

    if (!worktree) {
      return;
    }

    const justStartedRunning =
      previousProcessStatus !== "running" && worktree.processStatus === "running";

    if (!justStartedRunning || worktree.detectedPorts.length > 0) {
      return;
    }

    setIsWaitingSinceStart(true);
    const timeoutId = setTimeout(
      () => setIsWaitingSinceStart(false),
      FIRST_PORT_DETECTION_TIMEOUT_MS,
    );
    return () => clearTimeout(timeoutId);
  }, [worktree, worktree?.processStatus, worktree?.detectedPorts.length]);

  const isAwaitingFirstPort =
    isWaitingSinceStart &&
    worktree?.processStatus === "running" &&
    worktree.detectedPorts.length === 0;

  return isTransitioning || isStartMutationPending || isAwaitingFirstPort;
}
