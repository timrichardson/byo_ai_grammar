export type IssueType = "grammar";

export type SuggestionIssue = {
  offset: number;
  length: number;
  text: string;
  type: IssueType;
  message: string;
  suggestions: string[];
};

export type Settings = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  apiKeySource: "saved" | "env";
  model: string;
  checkCurrentParagraphOnly: boolean;
  debounceMs: number;
  customPrompt: string;
  grammarAllowlist: string[];
};

export type CheckBlock = {
  blockId: string;
  text: string;
};

export type CheckRequest = {
  tabId: number;
  activeBlockId: string;
  activeText: string;
  contextText: string;
  blocks: CheckBlock[];
};

export type CheckSuccess = {
  ok: true;
  issuesByBlock: Record<string, SuggestionIssue[]>;
};

export type CheckError = {
  ok: false;
  code: string;
  message: string;
};

export type CheckResponse = CheckSuccess | CheckError;

export type ConnectionTestResult = {
  ok: boolean;
  message: string;
};
