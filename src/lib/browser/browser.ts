import { chromium, type Browser, type BrowserContext } from "playwright";

export async function createBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: false,
    channel: "chrome",
  });
}

export async function createBrowserContext(
  browser: Browser
): Promise<BrowserContext> {
  return browser.newContext();
}