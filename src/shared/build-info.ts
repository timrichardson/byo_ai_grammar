declare const __BYO_AI_GRAMMAR_BUILD_STAMP__: string;

export const BUILD_STAMP = __BYO_AI_GRAMMAR_BUILD_STAMP__;

export function getBuildFingerprint(version: string): string {
  return `${version} (${BUILD_STAMP})`;
}
