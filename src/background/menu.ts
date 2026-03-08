const MENU_DEFINITIONS = [
  {
    id: "writing-suggestions-open-settings",
    title: "BYO AI Grammar Settings",
    contexts: ["compose_body", "editable", "selection"] as const
  },
  {
    id: "writing-suggestions-pause-message",
    title: "Pause Grammar Suggestions for This Draft",
    contexts: ["compose_body", "editable", "selection"] as const
  },
  {
    id: "writing-suggestions-reset-ignored",
    title: "Reset Ignored Suggestions",
    contexts: ["compose_body", "editable", "selection"] as const,
    enabled: true
  }
];

export async function createMenus(): Promise<void> {
  for (const definition of MENU_DEFINITIONS) {
    try {
      browser.menus.create({
        ...definition,
        contexts: [...definition.contexts]
      } as unknown as browser.menus._CreateCreateProperties);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("already exists")) {
        console.error("Unable to create menu", error);
      }
    }
  }
}
