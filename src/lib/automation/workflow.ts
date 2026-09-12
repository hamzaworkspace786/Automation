import type { BrowserContext, Page } from "playwright";
import type {
  AutomationAccount,
  AutomationMode,
  JobStage,
} from "@/types/automation";
import { runAuthentication } from "./authentication";
import { runPostAuthentication } from "./post-authentication";
import { sanitizeErrorMessage } from "./validation";
import {
  isGoogleSignInUrl,
  removeSessionState,
} from "@/lib/browser/session-state";
import fs from "fs";

type WorkflowResult = {
  success: boolean;
  message: string;
  failureStage?: JobStage;
  retryable?: boolean;
};

type StageCallback = (stage: JobStage) => void;

export async function runWorkflow(
  account: AutomationAccount,
  context: BrowserContext,
  targetUrl: string,
  mode: AutomationMode = "authenticate",
  onStage?: StageCallback,
): Promise<WorkflowResult> {
  let page: Page | undefined;

  try {
    onStage?.("opening");

    page = await context.newPage();

    if (mode === "reuse-session") {
      try {
        await page.goto("https://myaccount.google.com/", {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("ERR_ABORTED")) {
          // Session cookies may trigger redirects that abort the initial navigation.
          // Wait for the page to settle so we can reliably check the final URL.
          await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        } else {
          throw error;
        }
      }

      if (isGoogleSignInUrl(page.url())) {
        await removeSessionState(account.email);
        onStage?.("auth-expired");

        return {
          success: false,
          message: "AUTH_EXPIRED: the saved Google session is no longer valid.",
          failureStage: "auth-expired",
          retryable: false,
        };
      }
    }

    try {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("ERR_ABORTED")) {
        // Ignored. The navigation was aborted likely due to a client-side redirect (e.g. share.google -> maps).
        // The page will continue loading in the background and the locators will wait for elements.
      } else {
        throw error;
      }
    }

    if (mode === "visit-only") {
      await new Promise((resolve) => {
        setTimeout(resolve, 10_000);
      });

      onStage?.("completed");

      return {
        success: true,
        message: "Target URL visited successfully.",
      };
    }

    if (mode === "authenticate") {
      onStage?.("authenticating");

      const authentication = await runAuthentication(
        page,
        account.email,
        account.password ?? "",
        () => onStage?.("manual-verification-required"),
      );

      if (authentication.status !== "success") {
        onStage?.(authentication.status);

        return {
          success: false,
          message: authentication.message,
          failureStage: authentication.status,
          retryable: false,
        };
      }
    }

    onStage?.("post-authentication");

    // Fixed: Passing targetUrl as the second argument
    await runPostAuthentication(page, targetUrl);

    onStage?.("completed");

    return {
      success: true,
      message: "Browser workflow completed successfully.",
    };
  } catch (error) {
    const message = sanitizeErrorMessage(error);

    console.error(
      `Workflow failed for ${account.email}:`,
      message,
    );

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
        // Ignore page cleanup failures so the original job failure stays intact.
      }
    }
  }
}