import type { BrowserContext } from "playwright";
import type { AutomationJob, AutomationMode, JobStage } from "@/types/automation";
import { launchAccountContext } from "@/lib/browser/browser";
import { AUTOMATION_MAX_RETRIES } from "@/lib/batching";
import { runAutomationJob, type JobStageCallback } from "./worker";
import { sanitizeErrorMessage } from "./validation";

export async function runBatch(
  jobs: AutomationJob[],
  targetUrl: string,
  mode: AutomationMode = "reuse-session",
  onStage?: JobStageCallback,
  concurrencyLimit: number = 5
): Promise<AutomationJob[]> {
  console.log(`Starting batch with ${jobs.length} jobs (Concurrency: ${concurrencyLimit})`);

  // Assign distinct option indices to jobs so concurrent accounts pick different options
  const preparedJobs: AutomationJob[] = jobs.map((job, index) => ({
    ...job,
    categoryIndex: job.categoryIndex ?? (index % 8),
    retryCount: job.retryCount ?? 0,
    maxRetries: job.maxRetries ?? AUTOMATION_MAX_RETRIES,
  }));

  const results: AutomationJob[] = new Array(preparedJobs.length);

  async function processSingleJob(job: AutomationJob): Promise<AutomationJob> {
    let attempt = 0;
    const maxAttempts = job.maxRetries + 1;
    let currentJob: AutomationJob = {
      ...job,
      startedAt: job.startedAt ?? new Date().toISOString()
    };

    while (attempt < maxAttempts) {
      let context: BrowserContext | undefined;

      try {
        context = await launchAccountContext(currentJob.account.email);

        const result = await runAutomationJob(
          currentJob,
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
          result.stage === "auth-expired" ||
          result.retryable === false
        ) {
          return result;
        }

        if (currentJob.retryCount >= currentJob.maxRetries) {
          return {
            ...result,
            retryCount: currentJob.retryCount,
            maxRetries: currentJob.maxRetries,
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          };
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
        currentJob = nextRetryJob;
        attempt += 1;

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

        if (currentJob.retryCount >= currentJob.maxRetries) {
          return failedJob;
        }

        const retryJob: AutomationJob = {
          ...failedJob,
          status: "pending",
          stage: "retrying",
          retryCount: currentJob.retryCount + 1,
          updatedAt: new Date().toISOString(),
        };

        onStage?.(retryJob, "retrying");
        currentJob = retryJob;
        attempt += 1;

      } finally {
        if (context) {
          await context.close().catch(() => undefined);
        }
      }
    }

    return currentJob;
  }

  // Execute jobs concurrently in chunks matching the concurrency limit
  for (let i = 0; i < preparedJobs.length; i += concurrencyLimit) {
    const chunk = preparedJobs.slice(i, i + concurrencyLimit);
    const chunkPromises = chunk.map((job) => processSingleJob(job));

    const chunkResults = await Promise.all(chunkPromises);
    chunkResults.forEach((res, idx) => {
      results[i + idx] = res;
    });
  }

  console.log("Batch completed successfully.");
  return results;
}