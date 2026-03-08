function timestamp(): string {
  return new Date().toISOString();
}

export function formatDebugPrefix(scope: string): string {
  return `[${timestamp()}][BYO AI Grammar][${scope}]`;
}

export function formatStartupPrefix(): string {
  return `[${timestamp()}][BYO AI Grammar]`;
}

export function debugLog(enabled: boolean, scope: string, message: string, details?: unknown) {
  if (!enabled) {
    return;
  }

  const prefix = formatDebugPrefix(scope);
  if (typeof details === "undefined") {
    console.info(`${prefix} ${message}`);
    return;
  }

  console.info(`${prefix} ${message}`, details);
}
