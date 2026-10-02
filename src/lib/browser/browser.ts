import { chromium, type Browser, type BrowserContext } from "playwright";
import {
  loadStorageState,
  saveSession,
  type SaveSessionResult,
} from "./session-store";

export interface LaunchContextOptions {
  headless?: boolean;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  timezoneId?: string;
  locale?: string;
}

export interface AccountSession {
  browser: Browser;
  context: BrowserContext;
  /** True when a saved session file was found and loaded into this context. */
  restoredFromFile: boolean;
  /** Persist the current (verified, logged-in) session to the account's file. */
  save(targetUrl?: string): Promise<SaveSessionResult>;
  /** Close context and browser. Safe to call more than once. */
  close(): Promise<void>;
}

/**
 * Launches an isolated browser for one account, routed through that account's
 * proxy, and restores its saved session (cookies) if one exists.
 *
 * Each account gets its own browser process, so the proxy is applied to the
 * whole browser and there is no on-disk Chrome profile to grow or clean up.
 */
export async function launchAccountContext(
  email: string,
  options: LaunchContextOptions | boolean = false
): Promise<AccountSession> {
  // Maintain backward compatibility if a boolean 'headless' is passed directly
  const opts: LaunchContextOptions =
    typeof options === "boolean" ? { headless: options } : options;

  const browser = await chromium.launch({
    headless: opts.headless ?? false,
    channel: "chrome",
    proxy: opts.proxy,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-service-autorun",
      "--disk-cache-size=1",
      "--media-cache-size=1",
      "--disable-gpu-shader-disk-cache",
      "--disable-crash-reporter",
      "--disable-logging",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const storageState = loadStorageState(email);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      timezoneId: opts.timezoneId,
      locale: opts.locale,
      storageState,
    });

    let closed = false;

    return {
      browser,
      context,
      restoredFromFile: Boolean(storageState),
      save: (targetUrl?: string) => saveSession(context, email, targetUrl),
      close: async () => {
        if (closed) return;
        closed = true;
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      },
    };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}
