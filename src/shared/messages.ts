import type { CheckRequest, CheckResponse, ConnectionTestResult, Settings } from "./types";

export type RuntimeMessage =
  | { type: "settings:get" }
  | { type: "settings:set"; settings: Settings }
  | { type: "allowlist:add"; phrase: string }
  | { type: "connection:test" }
  | { type: "check:request"; payload: CheckRequest }
  | { type: "tab:pause"; tabId: number; paused: boolean }
  | { type: "tab:isPaused"; tabId: number };

export type RuntimeResponseMap = {
  "settings:get": Settings;
  "settings:set": { ok: true };
  "allowlist:add": { ok: true; settings: Settings };
  "connection:test": ConnectionTestResult;
  "check:request": CheckResponse;
  "tab:pause": { ok: true };
  "tab:isPaused": { paused: boolean };
};
