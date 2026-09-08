import type { Browser } from "playwright";
import type {
  AutomationJob,
  JobStage,
} from "@/types/automation";
import {
  createBrowser,
  createBrowserContext,
} from "@/lib/browser/browser";
import {
  runAutomationJob,
  type JobStageCallback,
} from "./worker";

export async function runBatch(
  jobs: AutomationJob[],
  targetUrl: string,
  onStage?: JobStageCallback
): Promise<AutomationJob[]> {
  console.log(
    `Starting batch with ${jobs.length} jobs`
  );

  let browser: Browser;

  try {
    browser = await createBrowser();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to start the browser.";

    return jobs.map((job) => {
      onStage?.(job, "failed");

      return {
        ...job,
        status: "failed",
        stage: "failed",
        error: message,
      };
    });
  }

  try {
    const results = await Promise.all(
      jobs.map(async (job) => {
        let context;

        try {
          context = await createBrowserContext(browser);

          const result =
            await runAutomationJob(
              job,
              context,
              targetUrl,
              (updatedJob, stage: JobStage) => {
                console.log(
                  `Job ${updatedJob.id} stage: ${stage}`
                );

                onStage?.(
                  updatedJob,
                  stage
                );
              }
            );

          console.log(
            `Job ${result.id} finished with stage: ${result.stage}`
          );

          return result;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown browser job error.";

          onStage?.(job, "failed");

          return {
            ...job,
            status: "failed" as const,
            stage: "failed" as const,
            error: message,
          };
        } finally {
          await context?.close();
        }
      })
    );

    console.log("Batch completed");

    return results;
  } finally {
    await browser.close();
  }
}