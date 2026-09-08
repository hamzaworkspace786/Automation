import type { BrowserContext } from "playwright";
import type { AutomationAccount, JobStage } from "@/types/automation";
import { runAuthentication } from "./authentication";
import { runPostAuthentication } from "./post-authentication";

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
  let page;

  try {
    // --------------------------------
    // 1. Open target
    // --------------------------------

    onStage?.("opening");

    page = await context.newPage();

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page.waitForLoadState("networkidle", {
      timeout: 30_000,
    });

    // --------------------------------
    // 2. Authentication
    // --------------------------------

    onStage?.("authenticating");

    await runAuthentication(
      page,
      account.email,
      account.password,
    );

    // --------------------------------
    // 3. Post-authentication action
    // --------------------------------

    onStage?.("post-authentication");

    await runPostAuthentication(page);

    // --------------------------------
    // 4. Completed
    // --------------------------------

    onStage?.("completed");

    return {
      success: true,
      message: "Browser workflow completed successfully.",
    };
  } catch (error) {
    console.error(
      `Workflow failed for ${account.email}:`,
      error,
    );

    onStage?.("failed");

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown workflow error.",
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}