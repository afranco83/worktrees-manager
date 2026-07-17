/**
 * Cola de promesas en memoria por `projectId`, para que dos creaciones de worktree
 * concurrentes del mismo proyecto no lean el mismo "puerto libre" antes de que
 * ninguna de las dos lo persista (ver ADR-0003). Suficiente en una app local
 * mono-proceso; no sobrevive a un reinicio ni sirve si el proceso deja de serlo.
 */
const queues = new Map<string, Promise<unknown>>();

export function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(projectId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  const settled = next.catch(() => undefined);

  queues.set(projectId, settled);

  // Libera la entrada del Map una vez asentada, si nadie ha encolado nada más
  // detrás — evita que el registro crezca sin límite a lo largo de la vida del proceso.
  void settled.then(() => {
    if (queues.get(projectId) === settled) {
      queues.delete(projectId);
    }
  });

  return next;
}
