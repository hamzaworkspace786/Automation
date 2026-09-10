import { chromium, type Browser, type BrowserContext } from "playwright";

export async function createBrowser(
  useConnectedBrowser = true,
): Promise<Browser> {
  const cdpUrl = process.env.AUTOMATION_CDP_URL;

  if (cdpUrl && useConnectedBrowser) {
    return chromium.connectOverCDP(cdpUrl);
  }

  return chromium.launch({
    headless: false,
    channel: "chrome",
  });
}

export async function createBrowserContext(
  browser: Browser,
  storageStatePath?: string,
): Promise<BrowserContext> {
  if (process.env.AUTOMATION_CDP_URL) {
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error("Connected Chrome has no available browser context.");
    }

    return context;
  }

  return browser.newContext(
    storageStatePath
      ? {
          storageState: storageStatePath,
        }
      : undefined,
  );
}