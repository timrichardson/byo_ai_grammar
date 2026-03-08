import { describe, expect, it } from "vitest";

import {
  MAX_AUTO_CONTEXT_CHARS,
  buildSelectedTextContext,
  clampJoinedContext
} from "./request-budget";

describe("request-budget", () => {
  it("caps joined automatic context", () => {
    const context = clampJoinedContext(["a".repeat(MAX_AUTO_CONTEXT_CHARS), "extra"]);

    expect(context).toHaveLength(MAX_AUTO_CONTEXT_CHARS);
  });

  it("builds bounded before-and-after context for selected text", () => {
    const before = "A".repeat(500);
    const selected = "selected text";
    const after = "B".repeat(500);
    const body = `${before}${selected}${after}`;
    const context = buildSelectedTextContext(body, before.length, before.length + selected.length, 100);

    expect(context).toBe(`${"A".repeat(50)}\n\n${"B".repeat(50)}`);
  });
});
