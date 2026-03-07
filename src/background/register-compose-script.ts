export async function registerComposeScript(): Promise<void> {
  try {
    await browser.scripting.compose.registerScripts([
      {
        id: "writing-suggestions-compose-script",
        js: ["compose-script.js"]
      }
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("already") && !message.toLowerCase().includes("duplicate")) {
      console.error("Unable to register compose script", error);
    }
  }
}
