import type { BrowserContext, Page } from "playwright";
import type {
  AutomationAccount,
  AutomationMode,
  JobStage,
} from "@/types/automation";
import { runAuthentication } from "./authentication";
import { sanitizeErrorMessage } from "./validation";

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

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

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