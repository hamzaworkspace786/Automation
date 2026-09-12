import type { BrowserContext } from "playwright";
import type { AutomationJob, AutomationMode, JobStage } from "@/types/automation";
import { launchAccountContext } from "@/lib/browser/browser";
import { AUTOMATION_MAX_RETRIES } from "@/lib/batching";
import { runAutomationJob, type JobStageCallback } from "./worker";
import { sanitizeErrorMessage } from "./validation";

export async function runBatch(
  jobs: AutomationJob[],
  targetUrl: string,
  mode: AutomationMode = "authenticate",
  onStage?: JobStageCallback
): Promise<AutomationJob[]> {
  console.log(`Starting batch with ${jobs.length} jobs`);
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
        context = await launchAccountContext(currentJob.account.email, mode !== "reuse-session");

        result = await runAutomationJob(
          { ...currentJob },
          context,
          targetUrl,
          mode,
          (updatedJob, stage: JobStage) => {
            console.log(`Job ${updatedJob.id} stage: ${stage}`);
            onStage?.(updatedJob, stage);
          }
        );

        if (
          result.status === "success" ||
          result.stage === "manual-verification-required" ||
          result.retryable === false
        ) {
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
        Object.assign(currentJob, {
          retryCount: nextRetryJob.retryCount,
          status: nextRetryJob.status,
          stage: nextRetryJob.stage,
          error: nextRetryJob.error,
          updatedAt: nextRetryJob.updatedAt,
        });

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

        if (failedJob.stage === "manual-verification-required" || failedJob.retryable === false) {
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
          Object.assign(currentJob, {
            retryCount: retryJob.retryCount,
            status: retryJob.status,
            stage: retryJob.stage,
            error: retryJob.error,
            updatedAt: retryJob.updatedAt,
          });

          attempt += 1;
          continue;
        }

        results.push(failedJob);
        break;
      } finally {
        if (context) {
          await context.close().catch(() => undefined);
        }
      }
    }

    if (result?.status === "success") return;

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
}