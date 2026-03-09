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

  it("emits insertion-only suggestions for missing helper words", () => {
    const suggestions = buildSuggestionsFromCorrection(
      "I going to send the update.",
      "I am going to send the update.",
      "block-1"
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      start: 2,
      end: 2,
      originalText: "",
      replacementText: "am ",
      suggestions: ["am "]
    });
  });

  it("emits insertion-only suggestions for missing punctuation", () => {
    const suggestions = buildSuggestionsFromCorrection(
      "However I agree.",
      "However, I agree.",
      "block-1"
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      start: 7,
      end: 7,
      originalText: "",
      replacementText: ",",
      suggestions: [","]
    });
  });

  it("emits deletion-only suggestions for repeated words", () => {
    const suggestions = buildSuggestionsFromCorrection(
      "The cat run ran up the tree.",
      "The cat ran up the tree.",
      "block-1"
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      originalText: "run ",
      replacementText: "",
      suggestions: []
    });
  });

  it("ignores smart-quote-only changes", () => {
    expect(buildSuggestionsFromCorrection('He said "hello".', 'He said “hello”.', "block-1")).toEqual([]);
    expect(buildSuggestionsFromCorrection("It's ready.", "It’s ready.", "block-1")).toEqual([]);
  });

  it("ignores content-word substitutions that are not local grammar fixes", () => {
    expect(buildSuggestionsFromCorrection("That's one step for a seal.", "That's one step for a man.", "block-1")).toEqual([]);
    expect(buildSuggestionsFromCorrection("That's one step for a seal.", "That's one small step for a seal.", "block-1")).toEqual([]);
  });
});
