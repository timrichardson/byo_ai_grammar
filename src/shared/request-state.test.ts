import { describe, expect, it } from "vitest";
import { isLatestParagraphRequest, isLatestRequest, matchesParagraphSnapshot, matchesSnapshot } from "./request-state";

describe("request-state helpers", () => {
  it("detects the latest request", () => {
    expect(isLatestRequest(4, 4)).toBe(true);
    expect(isLatestRequest(3, 4)).toBe(false);
    expect(isLatestParagraphRequest(7, 7)).toBe(true);
    expect(isLatestParagraphRequest(7, 8)).toBe(false);
    expect(isLatestParagraphRequest(7, undefined)).toBe(false);
  });

  it("matches snapshots only when block and text are unchanged", () => {
    expect(matchesSnapshot("block-1", "These updates is ready.", "block-1", "These updates is ready.")).toBe(true);
    expect(matchesSnapshot("block-1", "These updates is ready.", "block-2", "These updates is ready.")).toBe(false);
    expect(matchesSnapshot("block-1", "These updates is ready.", "block-1", "These updates are ready.")).toBe(false);
  });

  it("matches paragraph snapshots only when paragraph key and text are unchanged", () => {
    expect(matchesParagraphSnapshot("abc:0", "These updates is ready.", "abc:0", "These updates is ready.")).toBe(true);
    expect(matchesParagraphSnapshot("abc:0", "These updates is ready.", "abc:1", "These updates is ready.")).toBe(false);
    expect(matchesParagraphSnapshot("abc:0", "These updates is ready.", "abc:0", "These updates are ready.")).toBe(false);
  });
});
