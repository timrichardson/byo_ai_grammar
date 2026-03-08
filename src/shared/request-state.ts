/** Returns whether a response still belongs to the latest scheduled compose check. */
export function isLatestRequest(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}

/** Returns whether a response still belongs to the latest request for one paragraph lane. */
export function isLatestParagraphRequest(requestId: number, latestRequestId: number | undefined): boolean {
  return latestRequestId === requestId;
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

/** Returns whether a paragraph snapshot still maps to the current paragraph text. */
export function matchesParagraphSnapshot(
  snapshotParagraphKey: string,
  snapshotText: string,
  currentParagraphKey: string | null,
  currentText: string | null
): boolean {
  return snapshotParagraphKey === currentParagraphKey && snapshotText === currentText;
}
