import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, sanitizeStoredSettings } from "./settings";

describe("sanitizeStoredSettings", () => {
  it("falls back to the default debounce for invalid values", () => {
    expect(sanitizeStoredSettings({ debounceMs: Number.NaN }).debounceMs).toBe(DEFAULT_SETTINGS.debounceMs);
    expect(sanitizeStoredSettings({ debounceMs: -1 }).debounceMs).toBe(DEFAULT_SETTINGS.debounceMs);
    expect(sanitizeStoredSettings({ debounceMs: 1234 }).debounceMs).toBe(DEFAULT_SETTINGS.debounceMs);
  });

  it("normalizes custom prompt and allowlist entries", () => {
    const settings = sanitizeStoredSettings({
      customPrompt: "  Keep   it concise.  ",
      grammarAllowlist: ["  OpenCode  ", "opencode", "Thunderbird Daily"]
    });

    expect(settings.customPrompt).toBe("Keep it concise.");
    expect(settings.grammarAllowlist).toEqual(["OpenCode", "Thunderbird Daily"]);
  });
});
