import type { BrowserContext } from "playwright";
import type {
  Account,
  JobStage,
} from "@/types/automation";
import {
  runAuthenticationStage,
} from "./authentication";
import {
  runPostAuthenticationStage,
} from "./post-authentication";

export type WorkflowResult = {
  success: boolean;
  stage: "completed" | "failed";
  message: string;
};

export type StageCallback = (
  stage: JobStage
) => void;

export async function runWorkflow(
  account: Account,
  context: BrowserContext,
  targetUrl: string,
  onStage?: StageCallback
): Promise<WorkflowResult> {
  console.log(
    `Starting workflow for: ${account.email}`
  );

  try {
    const page = await context.newPage();

    // Stage 1: Opening
    onStage?.("opening");

    console.log(
      `Stage opening: ${account.email}`
    );

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
    });

    console.log(
      `Opened target website for: ${account.email}`
    );

    // Stage 2: Authentication
    onStage?.("authenticating");

    console.log(
      `Stage authenticating: ${account.email}`
    );

    const authenticationStatus =
      await runAuthenticationStage(
        page,
        account
      );

    console.log(
      `Authentication status for ${account.email}: ${authenticationStatus}`
    );

    // Stage 3: Post-authentication
    onStage?.("post-authentication");

    console.log(
      `Stage post-authentication: ${account.email}`
    );

    await runPostAuthenticationStage(
      page,
      account
    );

    // Stage 4: Completed
    onStage?.("completed");

    console.log(
      `Workflow completed for: ${account.email}`
    );

    return {
      success: true,
      stage: "completed",
      message:
        "Workflow completed successfully",
    };
  } catch (error) {
    onStage?.("failed");

    console.error(
      `Workflow failed for ${account.email}:`,
      error
    );

    return {
      success: false,
      stage: "failed",
      message:
        error instanceof Error
          ? error.message
          : "Unknown workflow error",
    };
  }
}