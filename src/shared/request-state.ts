/** Returns whether a response still belongs to the latest scheduled compose check. */
export function isLatestRequest(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}

/** Returns whether the active block snapshot still matches the current compose selection. */
export function matchesSnapshot(
  snapshotBlockId: string,
  snapshotText: string,
  currentBlockId: string | null,
  currentText: string | null
): boolean {
  return snapshotBlockId === currentBlockId && snapshotText === currentText;
}
