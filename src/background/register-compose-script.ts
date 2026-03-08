/**
 * Registers the compose script in an idempotent way.
 *
 * Thunderbird may restart or reload the background page while the compose script registration still
 * exists, so duplicate-registration errors are treated as expected noise.
 */
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
