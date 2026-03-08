import { describe, expect, it } from "vitest";

import { buildParagraphKey, getExclusionBoundaryOffset } from "./block-extractor";

describe("signature exclusion", () => {
  it("detects the signature separator", () => {
    const bodyText = [
      "Thanks, that helps.",
      "",
      "--",
      "Signature"
    ].join("\n");

    expect(getExclusionBoundaryOffset(bodyText)).toBe(bodyText.indexOf("--"));
  });

  it("returns null when no signature separator is present", () => {
    const bodyText = [
      "Hello there,",
      "",
      "These updates is ready to send.",
      "",
      "Thanks"
    ].join("\n");

    expect(getExclusionBoundaryOffset(bodyText)).toBeNull();
  });

  it("does not treat quoted reply text as an exclusion boundary anymore", () => {
    const bodyText = [
      "Latest update is ready.",
      "",
      "On 8/3/26 10:07, info@growthpath.com.au wrote:",
      "> Older quoted text"
    ].join("\n");

    expect(getExclusionBoundaryOffset(bodyText)).toBeNull();
  });

  it("still uses the signature boundary when quoted text appears earlier", () => {
    const bodyText = [
      "Latest update is ready.",
      "",
      "On 8/3/26 10:07, info@growthpath.com.au wrote:",
      "> Older quoted text",
      "",
      "--",
      "Signature"
    ].join("\n");

    expect(getExclusionBoundaryOffset(bodyText)).toBe(bodyText.indexOf("--"));
  });
});

describe("buildParagraphKey", () => {
  it("stays stable across whitespace normalization and changes by duplicate occurrence", () => {
    expect(buildParagraphKey("The updates are good.", 0)).toBe(buildParagraphKey("The   updates are good.", 0));
    expect(buildParagraphKey("The updates are good.", 0)).not.toBe(buildParagraphKey("The updates are good.", 1));
  });
});
