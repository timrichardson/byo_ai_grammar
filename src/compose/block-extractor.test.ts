import { describe, expect, it } from "vitest";

import { getExclusionBoundaryOffset, getQuotedReplyOffset } from "./block-extractor";

describe("quoted reply exclusion", () => {
  it("detects a plain-text reply header before quoted lines", () => {
    const bodyText = [
      "Thanks, that helps.",
      "",
      "On 8/3/26 10:07, info@growthpath.com.au wrote:",
      "> message: Pick step failed."
    ].join("\n");

    expect(getQuotedReplyOffset(bodyText)).toBe(bodyText.indexOf("On 8/3/26 10:07, info@growthpath.com.au wrote:"));
  });

  it("detects a Thunderbird reply header even when visible text drops leading > markers", () => {
    const bodyText = [
      "On 8/3/26 10:07, info@growthpath.com.au wrote:",
      "",
      "message: Pick step failed for sale SO-858922.",
      "",
      "these are good grammar"
    ].join("\n");

    expect(getQuotedReplyOffset(bodyText)).toBe(0);
  });

  it("does not treat ordinary lines ending in wrote as a quoted reply", () => {
    const bodyText = [
      "I wrote:",
      "Please keep the Pick/Pack/Ship workflow wording.",
      "Thanks."
    ].join("\n");

    expect(getQuotedReplyOffset(bodyText)).toBeNull();
  });

  it("uses the earliest quote or signature boundary", () => {
    const bodyText = [
      "Latest update is ready.",
      "",
      "On 8/3/26 10:07, info@growthpath.com.au wrote:",
      "> Older quoted text",
      "",
      "--",
      "Signature"
    ].join("\n");

    expect(getExclusionBoundaryOffset(bodyText)).toBe(bodyText.indexOf("On 8/3/26 10:07, info@growthpath.com.au wrote:"));
  });
});
