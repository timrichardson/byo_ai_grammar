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
    expect(prompt.system).toContain("needs_change");
    expect(prompt.system).not.toContain("zero-based offsets");
    expect(prompt.system).toContain("exactly two keys");
    expect(prompt.user).toContain("active_text");
    expect(prompt.user).not.toContain("output_schema");
  });

  it("mentions contextual homophone corrections while staying grammar-focused", () => {
    const prompt = buildPrompt({
      activeText: "However, as I see it, its going to be ok",
      contextText: "",
      customPrompt: "",
      grammarAllowlist: []
    });

    expect(prompt.system).toContain("homophone confusions");
    expect(prompt.system).toContain("to/too/two");
    expect(prompt.system).toContain("ordinary spelling mistakes");
    expect(prompt.system).toContain("contraction confusions");
    expect(prompt.system).toContain("its/it's");
    expect(prompt.system).toContain("Do not change the cognate or root word");
    expect(prompt.system).toContain("Example of what not to do");
    expect(prompt.system).toContain("Put it over their");
    expect(prompt.system).toContain("its going to be ok");
    expect(prompt.system).toContain("I have lived here since three years.");
  });
});
