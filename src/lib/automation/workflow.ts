import type { BrowserContext, Page } from "playwright";
import type { AutomationAccount, JobStage } from "@/types/automation";
import { runAuthentication } from "./authentication";
import { runPostAuthentication } from "./post-authentication";
import { sanitizeErrorMessage } from "./validation";

type WorkflowResult = {
  success: boolean;
  message: string;
};

type StageCallback = (stage: JobStage) => void;

export async function runWorkflow(
  account: AutomationAccount,
  context: BrowserContext,
  targetUrl: string,
  onStage?: StageCallback,
): Promise<WorkflowResult> {
  let page: Page | undefined;

  try {
    onStage?.("opening");

    page = await context.newPage();

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page.waitForLoadState("networkidle", {
      timeout: 30_000,
    });

    onStage?.("authenticating");

    await runAuthentication(
      page,
      account.email,
      account.password,
    );

    onStage?.("post-authentication");

    await runPostAuthentication(page);

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

    onStage?.("failed");

    return {
      success: false,
      message,
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