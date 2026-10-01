/** `limit` is `ServerSettings.maxConcurrentAgents`; `null` means no limit. */
export function agentConcurrencyBlockReason(
  activeThreadIds: ReadonlyArray<string>,
  targetThreadId: string | null,
  limit: number | null,
): string | null {
  if (limit === null) return null;
  if (targetThreadId !== null && activeThreadIds.includes(targetThreadId)) return null;
  if (activeThreadIds.length < limit) return null;
  const working = limit === 1 ? "An agent is" : `${limit} agents are`;
  return `${working} already working. Wait for one to finish or stop an agent before sending.`;
}
