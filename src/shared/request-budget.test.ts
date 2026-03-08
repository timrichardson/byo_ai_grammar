import { describe, expect, it } from "vitest";

import {
  MAX_AUTO_CONTEXT_CHARS,
  clampJoinedContext
} from "./request-budget";

describe("request-budget", () => {
  it("caps joined automatic context", () => {
    const context = clampJoinedContext(["a".repeat(MAX_AUTO_CONTEXT_CHARS), "extra"]);

    expect(context).toHaveLength(MAX_AUTO_CONTEXT_CHARS);
  });
});
