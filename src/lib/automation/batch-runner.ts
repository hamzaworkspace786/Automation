import type { AutomationJob, AutomationMode, JobStage } from "@/types/automation";
import { launchAccountContext, type AccountSession } from "@/lib/browser/browser";
import { AUTOMATION_MAX_RETRIES } from "@/lib/batching";
import { runAutomationJob, type JobStageCallback } from "./worker";
import { sanitizeErrorMessage } from "./validation";
import { getProxyConfigForAccount, type AccountProxyConfig } from "@/lib/proxy/proxy-config";

type JobWithProxy = AutomationJob & {
  proxyConfig?: AccountProxyConfig;
};

export async function runBatch(
  jobs: AutomationJob[],
  targetUrl: string,
  mode: AutomationMode = "reuse-session",
  onStage?: JobStageCallback,
  concurrencyLimit: number = 5,
  globalOffset: number = 0 // Tracks absolute position across batches (only used to pick a country for NEW accounts)
): Promise<AutomationJob[]> {
  console.log(`Starting batch with ${jobs.length} jobs (Concurrency: ${concurrencyLimit}, Offset: ${globalOffset})`);

  // Resolve each account's persisted proxy binding (created on first sight, reused forever after)
  const preparedJobs: JobWithProxy[] = jobs.map((job, index) => {
    const globalIndex = globalOffset + index;
    const proxyConfig = getProxyConfigForAccount(job.account.email, globalIndex);

    console.log(
      `[Proxy Setup] Account ${job.account.email} -> Country: ${proxyConfig.countryCode.toUpperCase()} | sessid: ${proxyConfig.sessionId}`
    );

    return {
      ...job,
      categoryIndex: job.categoryIndex ?? (globalIndex % 8),
      retryCount: job.retryCount ?? 0,
      maxRetries: job.maxRetries ?? AUTOMATION_MAX_RETRIES,
      proxyConfig,
    };
  });

  const results: AutomationJob[] = new Array(preparedJobs.length);

  async function processSingleJob(job: JobWithProxy): Promise<AutomationJob> {
    let attempt = 0;
    const maxAttempts = job.maxRetries + 1;
    let currentJob: JobWithProxy = {
      ...job,
      startedAt: job.startedAt ?? new Date().toISOString()
    };

    while (attempt < maxAttempts) {
      let session: AccountSession | undefined;

      try {
        session = await launchAccountContext(currentJob.account.email, {
          headless: false,
          proxy: currentJob.proxyConfig?.proxy,
          timezoneId: currentJob.proxyConfig?.timezoneId,
          locale: currentJob.proxyConfig?.locale,
        });

        console.log(
          `[Session] ${currentJob.account.email}: ${session.restoredFromFile ? "restored saved session" : "no saved session (fresh)"}`
        );

        const activeSession = session;

        const result = await runAutomationJob(
          currentJob,
          activeSession.context,
          targetUrl,
          mode,
          (updatedJob, stage: JobStage) => {
            console.log(`Job ${updatedJob.id} stage: ${stage}`);
            onStage?.(updatedJob, stage);
          },
          {
            proxied: Boolean(currentJob.proxyConfig?.proxy),
            expectedCountry: currentJob.proxyConfig?.countryCode,
            onSessionValidated: async () => {
              try {
                const saved = await activeSession.save(targetUrl);
                console.log(
                  `[Session] ${currentJob.account.email}: saved ${saved.cookies} cookies, ${(saved.bytes / 1024).toFixed(1)} KB`
                );
              } catch (error) {
                console.warn(
                  `[Session] ${currentJob.account.email}: save failed: ${sanitizeErrorMessage(error)}`
                );
              }
            },
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

        const nextRetryJob: JobWithProxy = {
          ...result,
          status: "pending",
          stage: "retrying",
          retryCount: currentJob.retryCount + 1,
          maxRetries: currentJob.maxRetries,
          error: result.error,
          updatedAt: new Date().toISOString(),
          proxyConfig: currentJob.proxyConfig,
        };

        onStage?.(nextRetryJob, "retrying");
        currentJob = nextRetryJob;
        attempt += 1;

      } catch (error) {
        const failureMessage = sanitizeErrorMessage(error);
        const failedJob: JobWithProxy = {
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

        const retryJob: JobWithProxy = {
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
        if (session) {
          await session.close();
        }
      }
    }

    return currentJob;
  }

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
