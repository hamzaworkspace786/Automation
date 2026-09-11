import type { Browser, BrowserContext } from "playwright";
import type {
  AutomationJob,
  AutomationMode,
  JobStage,
} from "@/types/automation";
import {
  createBrowser,
  createBrowserContext,
} from "@/lib/browser/browser";
import { assertSessionStateExists } from "@/lib/browser/session-state";
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
  mode: AutomationMode = "authenticate",
  onStage?: JobStageCallback
): Promise<AutomationJob[]> {
  console.log(
    `Starting batch with ${jobs.length} jobs`
  );

  let browser: Browser | undefined;

  try {
    browser = await createBrowser(mode !== "reuse-session");
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

    await Promise.all(jobs.map(async (job) => {
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
          const sessionStatePath =
            mode === "reuse-session"
              ? await assertSessionStateExists(currentJob.account.email)
              : undefined;

          context = await createBrowserContext(
            browser,
            sessionStatePath,
            mode !== "reuse-session" &&
              Boolean(process.env.AUTOMATION_CDP_URL),
          );

          result = await runAutomationJob(
            {
              ...currentJob,
            },
            context,
            targetUrl,
            mode,
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

          if (result.stage === "manual-verification-required") {
            results.push(result);
            break;
          }

          if (result.retryable === false) {
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

          if (failureMessage.startsWith("Session state file is missing")) {
            failedJob.retryable = false;
          }

          if (failedJob.stage === "manual-verification-required") {
            results.push(failedJob);
            break;
          }

          if (failedJob.retryable === false) {
            results.push(failedJob);
            break;
          }

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
          if (
            mode === "reuse-session" ||
            !process.env.AUTOMATION_CDP_URL
          ) {
            await context?.close().catch(() => undefined);
          }
        }
      }

      if (result?.status === "success") {
        return;
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
    }));

    console.log("Batch completed");

    return results;
  } finally {
    if (browser) {
      if (
        mode === "reuse-session" ||
        !process.env.AUTOMATION_CDP_URL
      ) {
        await browser.close().catch(() => undefined);
      }
    }
  }
}