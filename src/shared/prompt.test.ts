import { describe, expect, it } from "vitest";
import { buildPrompt } from "./prompt";

describe("buildPrompt", () => {
  it("requests corrected_text rather than offsets", () => {
    const prompt = buildPrompt({
      activeText: "These updates is ready.",
      contextText: "",
      customPrompt: "",
      grammarAllowlist: []
    });

    expect(prompt.system).toContain("corrected_text");
    expect(prompt.system).not.toContain("zero-based offsets");
    expect(prompt.system).toContain("exactly one key");
    expect(prompt.user).toContain("active_text");
    expect(prompt.user).not.toContain("output_schema");
  });
});
