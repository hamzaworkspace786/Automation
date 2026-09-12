import { chromium, type BrowserContext } from "playwright";
import { getAccountProfileDir } from "./session-state";

export async function launchAccountContext(
  email: string,
  headless = false
): Promise<BrowserContext> {
  const profileDir = getAccountProfileDir(email);

  return chromium.launchPersistentContext(profileDir, {
    headless,
    channel: "chrome",
    viewport: { width: 1280, height: 720 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-service-autorun",
    ],
  });
}