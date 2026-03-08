import { describe, expect, it } from "vitest";

import { buildPopupReplacements } from "./popup";
import type { GrammarSuggestion } from "../shared/types";

function createIssue(overrides: Partial<GrammarSuggestion>): GrammarSuggestion {
  return {
    id: "issue-1",
    start: 0,
    end: 0,
    originalText: "",
    replacementText: "",
    type: "grammar",
    message: "Consider this grammar change.",
    suggestions: [],
    ...overrides
  };
}

describe("buildPopupReplacements", () => {
  it("creates a delete action for deletion-only suggestions", () => {
    const replacements = buildPopupReplacements(createIssue({
      originalText: "run ",
      replacementText: "",
      suggestions: []
    }));

    expect(replacements).toEqual([{ label: 'Remove "run"', value: "" }]);
  });

  it("prefers explicit suggestion replacements when present", () => {
    const replacements = buildPopupReplacements(createIssue({
      originalText: "is",
      replacementText: "are",
      suggestions: ["are"]
    }));

    expect(replacements).toEqual([{ label: "are", value: "are" }]);
  });
});
