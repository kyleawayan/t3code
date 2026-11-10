// Lets a composer send reach the sidebar chrono without either importing the other's component.
const listeners = new Set<() => void>();

export function nudgeChronoOnSend(): void {
  for (const listener of listeners) listener();
}

export function onChronoSendNudge(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
