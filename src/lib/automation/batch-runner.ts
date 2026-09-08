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

  const browser: Browser =
    await createBrowser();

  try {
    const results = await Promise.all(
      jobs.map(async (job) => {
        const context =
          await createBrowserContext(browser);

        try {
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
        } finally {
          await context.close();
        }
      })
    );

    console.log("Batch completed");

    return results;
  } finally {
    await browser.close();
  }
}