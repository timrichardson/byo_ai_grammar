import { debugLog } from "../shared/debug";
import type { RuntimeMessage } from "../shared/messages";

/** Mirrors compose-side debug logs to the background page when debug mode is enabled. */
export function composeDebugLog(enabled: boolean, scope: string, message: string, details?: unknown) {
  debugLog(enabled, scope, message, details);

  if (!enabled) {
    return;
  }

  browser.runtime.sendMessage({
    type: "debug:log",
    scope,
    message,
    details
  } satisfies RuntimeMessage).catch(() => {
    // Ignore mirrored log transport failures.
  });
}
