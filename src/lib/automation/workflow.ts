import type { BrowserContext, Page } from "playwright";
import type { Account, AutomationMode, JobStage } from "@/types/automation";
import { runAuthentication } from "./authentication";
import { runPostAuthentication } from "./post-authentication";
import { sanitizeErrorMessage } from "./validation";
import { isGoogleSignInUrl } from "@/lib/browser/session-state";
import fs from "fs";

type WorkflowResult = {
  success: boolean;
  message: string;
  failureStage?: JobStage;
  retryable?: boolean;
};

type StageCallback = (stage: JobStage) => void;

export type WorkflowHooks = {
  /**
   * Called once the account is confirmed signed in to Google.
   * This is where the session file gets saved.
   */
  onSessionValidated?: () => Promise<void>;
};

async function gotoTolerant(page: Page, url: string, timeout: number) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  } catch (error) {
    if (error instanceof Error && error.message.includes("ERR_ABORTED")) {
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    } else {
      throw error;
    }
  }
}

/** True if Google lets us open the account page without bouncing to sign-in. */
async function hasValidGoogleSession(page: Page): Promise<boolean> {
  await gotoTolerant(page, "https://myaccount.google.com/", 30_000);
  return !isGoogleSignInUrl(page.url());
}

export async function runWorkflow(
  account: Account,
  context: BrowserContext,
  targetUrl: string,
  mode: AutomationMode = "authenticate",
  onStage?: StageCallback,
  categoryIndex: number = 0,
  hooks: WorkflowHooks = {}
): Promise<WorkflowResult> {
  let page: Page | undefined;

  try {
    onStage?.("opening");

    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();

    if (mode === "reuse-session") {
      if (!(await hasValidGoogleSession(page))) {
        onStage?.("auth-expired");

        return {
          success: false,
          message: "AUTH_EXPIRED: The saved Google session is no longer valid. Manual login required.",
          failureStage: "auth-expired",
          retryable: false,
        };
      }

      // Cookies may have been refreshed by Google; keep the file current.
      await hooks.onSessionValidated?.();
    }

    if (mode === "visit-only") {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForTimeout(10_000);
      onStage?.("completed");
      return { success: true, message: "Target URL visited successfully." };
    }

    if (mode === "authenticate") {
      onStage?.("authenticating");

      // If a saved session is still valid, skip the manual login entirely.
      const alreadySignedIn = await hasValidGoogleSession(page).catch(() => false);

      if (alreadySignedIn) {
        console.log(`Saved session for ${account.email} is still valid, skipping manual login.`);
      } else {
        const authentication = await runAuthentication(
          page,
          account.email,
          account.password ?? "",
          () => onStage?.("manual-verification-required"),
        );

        if (authentication.status !== "success") {
          const failureStage: JobStage = authentication.status as JobStage;
          onStage?.(failureStage);
          return {
            success: false,
            message: authentication.message,
            failureStage,
            retryable: false,
          };
        }

        // Don't trust "left the sign-in page" alone: confirm before saving anything.
        const confirmed = await hasValidGoogleSession(page).catch(() => false);
        if (!confirmed) {
          onStage?.("failed");
          return {
            success: false,
            message: "Login finished but the Google session could not be confirmed.",
            failureStage: "failed",
            retryable: false,
          };
        }
      }

      await hooks.onSessionValidated?.();
    }

    onStage?.("post-authentication");
    await runPostAuthentication(page, targetUrl, categoryIndex);
    onStage?.("completed");

    return { success: true, message: "Browser workflow completed successfully." };
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    console.error(`Workflow failed for ${account.email}:`, message);
    fs.appendFileSync('workflow_error.log', `[${new Date().toISOString()}] ${account.email}: ${message}\n${error instanceof Error ? error.stack : ''}\n`);

    onStage?.("failed");

    return {
      success: false,
      message,
      failureStage: "failed",
    };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {
        // Ignore page cleanup failures
      }
    }
  }
}
