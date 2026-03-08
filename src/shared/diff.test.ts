import { describe, expect, it } from "vitest";
import { buildSuggestionsFromCorrection } from "./diff";

describe("buildSuggestionsFromCorrection", () => {
  it("builds a replacement suggestion for a simple grammar change", () => {
    const suggestions = buildSuggestionsFromCorrection(
      "These updates is ready to send.",
      "These updates are ready to send.",
      "block-1"
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      originalText: "is",
      replacementText: "are",
      suggestions: ["are"]
    });
  });

  it("does not emit suggestions when the corrected text is unchanged", () => {
    expect(buildSuggestionsFromCorrection("Looks good.", "Looks good.", "block-1")).toEqual([]);
  });

  it("bundles nearby whitespace-separated edits into one suggestion", () => {
    const suggestions = buildSuggestionsFromCorrection(
      "Dogs are smarter than cats. But cat is more fun.",
      "Dogs are smarter than cats, but cats are more fun.",
      "block-1"
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      originalText: ". But cat is",
      replacementText: ", but cats are",
      suggestions: [", but cats are"]
    });
  });

  it("ignores trailing whitespace-only cleanup", () => {
    expect(buildSuggestionsFromCorrection("Looks good. ", "Looks good.", "block-1")).toEqual([]);
  });
});
