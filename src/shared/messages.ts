import type { CheckRequest, CheckResponse, ConnectionTestResult, Settings } from "./types";

/** Runtime messages exchanged between compose, options, and background contexts. */
export type RuntimeMessage =
  | { type: "settings:get" }
  | { type: "settings:set"; settings: Settings }
  | { type: "allowlist:add"; phrase: string }
  | { type: "debug:log"; scope: string; message: string; details?: unknown }
  | { type: "connection:test"; settings?: Settings }
  | { type: "tab:getCurrent" }
  | { type: "check:request"; payload: CheckRequest }
  | { type: "tab:pause"; tabId: number; paused: boolean }
  | { type: "tab:isPaused"; tabId: number }
  | { type: "tab:selection"; tabId: number; hasSelection: boolean }
  | { type: "compose:runSelectedBlocksCheck" };

/** Response types keyed by runtime message discriminator for shared message handling. */
export type RuntimeResponseMap = {
  "settings:get": Settings;
  "settings:set": { ok: true };
  "allowlist:add": { ok: true; settings: Settings };
  "debug:log": { ok: true };
  "connection:test": ConnectionTestResult;
  "tab:getCurrent": { tabId: number | null };
  "check:request": CheckResponse;
  "tab:pause": { ok: true };
  "tab:isPaused": { paused: boolean };
  "tab:selection": { ok: true };
  "compose:runSelectedBlocksCheck": { handled: boolean };
};
