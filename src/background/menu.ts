const MENU_DEFINITIONS = [
  {
    id: "writing-suggestions-open-settings",
    title: "BYO AI Grammar Settings",
    contexts: ["compose_body", "editable", "selection"]
  },
  {
    id: "writing-suggestions-pause-message",
    title: "Pause BYO AI Grammar for This Message",
    contexts: ["compose_body", "editable", "selection"]
  }
];

export async function createMenus(): Promise<void> {
  for (const definition of MENU_DEFINITIONS) {
    try {
      browser.menus.create(definition);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("already exists")) {
        console.error("Unable to create menu", error);
      }
    }
  }
}
