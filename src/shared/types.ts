export type SuggestionType = "grammar";

/** Local grammar edit rendered in the compose UI for one block. */
export type GrammarSuggestion = {
  id: string;
  start: number;
  end: number;
  originalText: string;
  replacementText: string;
  type: SuggestionType;
  message: string;
  suggestions: string[];
};

/** Persisted extension settings stored in Thunderbird local storage. */
export type Settings = {
  enabled: boolean;
  debugMode: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  checkCurrentParagraphOnly: boolean;
  debounceMs: number;
  customPrompt: string;
  grammarAllowlist: string[];
};

/** One block snapshot included in a compose check request. */
export type CheckBlock = {
  blockId: string;
  text: string;
};

/** Compose-to-background request payload for one grammar check cycle. */
export type CheckRequest = {
  requestId: number;
  tabId: number;
  activeBlockId: string;
  activeText: string;
  contextText: string;
  blocks: CheckBlock[];
};

/** Successful background grammar check response keyed by block id. */
export type CheckSuccess = {
  ok: true;
  requestId: number;
  correctedTextByBlock: Record<string, string>;
  suggestionsByBlock: Record<string, GrammarSuggestion[]>;
};

/** Failed background grammar check response with a user-facing error code and message. */
export type CheckError = {
  ok: false;
  requestId: number;
  code: string;
  message: string;
};

/** Union of successful and failed grammar check responses returned to the compose script. */
export type CheckResponse = CheckSuccess | CheckError;

/** Result shown in the options page after testing provider connectivity. */
export type ConnectionTestResult = {
  ok: boolean;
  message: string;
};

/** Normalized corrected-text payload recovered from a provider response. */
export type CorrectedTextResult = {
  correctedText: string;
  sourceField: string;
  recovered: boolean;
};
