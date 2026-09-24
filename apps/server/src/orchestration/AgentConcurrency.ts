export const MAX_CONCURRENT_AGENTS = 2;

export function agentConcurrencyBlockReason(
  activeThreadIds: ReadonlyArray<string>,
  targetThreadId: string | null,
): string | null {
  if (targetThreadId !== null && activeThreadIds.includes(targetThreadId)) return null;
  return activeThreadIds.length >= MAX_CONCURRENT_AGENTS
    ? "Two agents are already working. Wait for one to finish or stop an agent before sending."
    : null;
}
