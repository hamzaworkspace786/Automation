import { getJob, updateJobResult } from "@/lib/automation/job-store";
import { createBrowser, createBrowserContext } from "@/lib/browser/browser";
import { toPublicJob } from "@/lib/automation/jobs";
import { getRun } from "@/lib/automation/run-store";
import { runAutomationJob } from "@/lib/automation/worker";
import type { AutomationJob } from "@/types/automation";

type RouteContext = {
  params: Promise<{
    runId: string;
    jobId: string;
  }>;
};

export async function POST(
  _request: Request,
  context: RouteContext
) {
  try {
    const { runId, jobId } = await context.params;

    const run = getRun(runId);
    const job = getJob(jobId);

    if (!run) {
      return Response.json(
        {
          error: "Run not found",
        },
        {
          status: 404,
        }
      );
    }

    if (!job) {
      return Response.json(
        {
          error: "Job not found",
        },
        {
          status: 404,
        }
      );
    }

    if (job.runId !== runId) {
      return Response.json(
        {
          error: "Job does not belong to this run",
        },
        {
          status: 400,
        }
      );
    }

    if (job.status !== "failed") {
      return Response.json(
        {
          error: "Only failed jobs can be retried",
        },
        {
          status: 400,
        }
      );
    }

    if (job.retryCount >= job.maxRetries) {
      return Response.json(
        {
          error: "Maximum retry attempts reached for this job",
        },
        {
          status: 400,
        }
      );
    }

    const retryJob: AutomationJob = {
      ...job,
      status: "pending",
      stage: "retrying",
      error: undefined,
      retryCount: job.retryCount + 1,
      maxRetries: job.maxRetries,
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      updatedAt: new Date().toISOString(),
    };

    updateJobResult(retryJob);

    let browser;
    let browserContext;

    try {
      browser = await createBrowser();
      browserContext = await createBrowserContext(browser);

      const result = await runAutomationJob(
        retryJob,
        browserContext,
        run.targetUrl,
        (updatedJob) => {
          updateJobResult({
            ...updatedJob,
            retryCount: retryJob.retryCount,
            maxRetries: retryJob.maxRetries,
          });
        }
      );

      const finalJob: AutomationJob = {
        ...result,
        retryCount: retryJob.retryCount,
        maxRetries: retryJob.maxRetries,
        updatedAt: new Date().toISOString(),
        completedAt:
          result.status === "success" || result.status === "failed"
            ? new Date().toISOString()
            : undefined,
      };

      updateJobResult(finalJob);

      return Response.json({
        job: toPublicJob(finalJob),
        runId,
        jobId: finalJob.id,
        status: finalJob.status,
      });
    } catch (error) {
      const failureMessage =
        error instanceof Error
          ? error.message
          : "Unknown retry error";

      const failedRetry: AutomationJob = {
        ...retryJob,
        status: "failed",
        stage: "failed",
        error: failureMessage,
        retryCount: retryJob.retryCount,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      updateJobResult(failedRetry);

      return Response.json(
        {
          error: failureMessage,
          job: toPublicJob(failedRetry),
        },
        {
          status: 500,
        }
      );
    } finally {
      await browserContext?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  } catch (error) {
    console.error("Retry request failed:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error",
      },
      {
        status: 500,
      }
    );
  }
}
