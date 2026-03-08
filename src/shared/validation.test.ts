import { describe, expect, it } from "vitest";
import { normalizeCorrectedTextResponse, parseCorrectedTextContent } from "./validation";

describe("normalizeCorrectedTextResponse", () => {
  it("accepts a valid corrected_text response", () => {
    expect(normalizeCorrectedTextResponse({ corrected_text: "These updates are ready to send." }, "These updates is ready to send.")).toEqual({
      correctedText: "These updates are ready to send.",
      sourceField: "corrected_text",
      recovered: false
    });
  });

  it("recovers corrected text from a non-standard single string field", () => {
    expect(normalizeCorrectedTextResponse({ commentary: "These updates are ready to send." }, "These updates is ready to send.")).toEqual({
      correctedText: "These updates are ready to send.",
      sourceField: "commentary",
      recovered: true
    });
  });

  it("rejects an over-broad rewrite", () => {
    expect(() => normalizeCorrectedTextResponse({ corrected_text: "A much longer rewritten paragraph that changes the entire meaning and structure of the original sentence for no good reason at all." }, "Short text.")).toThrow(
      "over-broad rewrite"
    );
  });
});

describe("parseCorrectedTextContent", () => {
  it("extracts a JSON object from surrounding text", () => {
    expect(parseCorrectedTextContent("Here is the result: {\"corrected_text\":\"These updates are ready to send.\"}", "These updates is ready to send.").result).toEqual({
      correctedText: "These updates are ready to send.",
      sourceField: "corrected_text",
      recovered: false
    });
  });

  it("falls back to plain text when the model returns only corrected text", () => {
    expect(parseCorrectedTextContent("These updates are ready to send.", "These updates is ready to send.").result).toEqual({
      correctedText: "These updates are ready to send.",
      sourceField: "corrected_text",
      recovered: false
    });
  });
});
