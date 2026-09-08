import type { Browser, BrowserContext } from "playwright";
import type {
  AutomationJob,
  JobStage,
} from "@/types/automation";
import {
  createBrowser,
  createBrowserContext,
} from "@/lib/browser/browser";
import {
  AUTOMATION_MAX_RETRIES,
} from "@/lib/batching";
import {
  runAutomationJob,
  type JobStageCallback,
} from "./worker";
import { sanitizeErrorMessage } from "./validation";

export async function runBatch(
  jobs: AutomationJob[],
  targetUrl: string,
  onStage?: JobStageCallback
): Promise<AutomationJob[]> {
  console.log(
    `Starting batch with ${jobs.length} jobs`
  );

  let browser: Browser | undefined;

  try {
    browser = await createBrowser();
  } catch (error) {
    const message = sanitizeErrorMessage(error);

    return jobs.map((job) => {
      const failedJob: AutomationJob = {
        ...job,
        status: "failed",
        stage: "failed",
        error: message,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      onStage?.(failedJob, "failed");

      return failedJob;
    });
  }

  try {
    const results: AutomationJob[] = [];

    for (const job of jobs) {
      const currentJob: AutomationJob = {
        ...job,
        retryCount: job.retryCount ?? 0,
        maxRetries: job.maxRetries ?? AUTOMATION_MAX_RETRIES,
      };

      let attempt = 0;
      const maxAttempts = currentJob.maxRetries + 1;
      let result: AutomationJob | undefined;

      while (attempt < maxAttempts) {
        let context: BrowserContext | undefined;

        try {
          context = await createBrowserContext(browser);

          result = await runAutomationJob(
            {
              ...currentJob,
            },
            context,
            targetUrl,
            (updatedJob, stage: JobStage) => {
              console.log(
                `Job ${updatedJob.id} stage: ${stage}`
              );

              onStage?.(updatedJob, stage);
            }
          );

          if (result.status === "success") {
            results.push(result);
            break;
          }

          if (currentJob.retryCount >= currentJob.maxRetries) {
            results.push({
              ...result,
              retryCount: currentJob.retryCount,
              maxRetries: currentJob.maxRetries,
              updatedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            });
            break;
          }

          const nextRetryJob: AutomationJob = {
            ...result,
            status: "pending",
            stage: "retrying",
            retryCount: currentJob.retryCount + 1,
            maxRetries: currentJob.maxRetries,
            error: result.error,
            updatedAt: new Date().toISOString(),
          };

          onStage?.(nextRetryJob, "retrying");

          currentJob.retryCount = nextRetryJob.retryCount;
          currentJob.status = nextRetryJob.status;
          currentJob.stage = nextRetryJob.stage;
          currentJob.error = nextRetryJob.error;
          currentJob.updatedAt = nextRetryJob.updatedAt;

          attempt += 1;
          continue;
        } catch (error) {
          const failureMessage = sanitizeErrorMessage(error);

          const failedJob: AutomationJob = {
            ...currentJob,
            status: "failed",
            stage: "failed",
            error: failureMessage,
            retryCount: currentJob.retryCount,
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          };

          if (currentJob.retryCount < currentJob.maxRetries) {
            const retryJob: AutomationJob = {
              ...failedJob,
              status: "pending",
              stage: "retrying",
              retryCount: currentJob.retryCount + 1,
              error: failureMessage,
              updatedAt: new Date().toISOString(),
            };

            onStage?.(retryJob, "retrying");

            currentJob.retryCount = retryJob.retryCount;
            currentJob.status = retryJob.status;
            currentJob.stage = retryJob.stage;
            currentJob.error = retryJob.error;
            currentJob.updatedAt = retryJob.updatedAt;

            attempt += 1;
            continue;
          }

          results.push(failedJob);
          break;
        } finally {
          await context?.close().catch(() => undefined);
        }
      }

      if (result?.status === "success") {
        continue;
      }

      if (!results.some((entry) => entry.id === currentJob.id) && result) {
        results.push({
          ...result,
          retryCount: currentJob.retryCount,
          maxRetries: currentJob.maxRetries,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
      }
    }

    console.log("Batch completed");

    return results;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}