import {
  AUTOMATION_BATCH_SIZE,
  createBatches,
} from "@/lib/batching";
import {
  createJobs,
  toPublicJob,
} from "@/lib/automation/jobs";
import { runBatch } from "@/lib/automation/batch-runner";
import {
  initializeJobs,
  updateJobResult,
  updateJobStage,
} from "@/lib/automation/job-store";
import {
  createRun,
  getRunProgress,
  syncRunStatus,
  updateRunStatus,
} from "@/lib/automation/run-store";
import { validateAccountList } from "@/lib/automation/validation";
import type {
  AutomationRequest,
} from "@/types/automation";

export async function POST(
  request: Request
) {
  try {
    const body: AutomationRequest =
      await request.json();

    const {
      targetUrl,
      accounts,
      mode = "authenticate",
    } = body;

    if (mode !== "visit-only" && mode !== "authenticate") {
      return new Response(
        JSON.stringify({
          error: "Automation mode must be visit-only or authenticate.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (!targetUrl || !targetUrl.trim()) {
      return new Response(
        JSON.stringify({
          error: "Target URL is required.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    let parsedTargetUrl: URL;

    try {
      parsedTargetUrl = new URL(targetUrl.trim());
    } catch {
      return new Response(
        JSON.stringify({
          error: "Target URL must be a valid URL.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (
      parsedTargetUrl.protocol !== "http:" &&
      parsedTargetUrl.protocol !== "https:"
    ) {
      return new Response(
        JSON.stringify({
          error: "Target URL must use HTTP or HTTPS.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const validationErrors = validateAccountList(
      Array.isArray(accounts) ? accounts : [],
      mode,
    );

    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({
          error: validationErrors[0],
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (
          event: string,
          data: unknown
        ) => {
          const message =
            `event: ${event}\n` +
            `data: ${JSON.stringify(data)}\n\n`;

          controller.enqueue(
            encoder.encode(message)
          );
        };

        const runAutomation = async () => {
          let runId: string | undefined;

          try {
            const totalBatches = Math.ceil(
              accounts.length / AUTOMATION_BATCH_SIZE
            );

            const run = createRun(
              parsedTargetUrl.toString(),
              accounts.length,
              totalBatches,
              mode,
            );

            runId = run.id;

            const jobs = createJobs(accounts, run.id);
            const batches = createBatches(
              jobs,
              AUTOMATION_BATCH_SIZE
            );

            initializeJobs(jobs);

            sendEvent("connected", {
              message: "Automation started",
              runId: run.id,
              totalJobs: jobs.length,
              totalBatches: batches.length,
            });

            const allResults = [];

            for (const [index, batch] of batches.entries()) {
              const batchNumber = index + 1;

              sendEvent("batch_started", {
                runId: run.id,
                batch: batchNumber,
                totalBatches: batches.length,
                jobs: batch.length,
              });

              const results = await runBatch(
                batch,
                parsedTargetUrl.toString(),
                mode,
                (job, stage) => {
                  const updatedJob = updateJobStage(
                    job.id,
                    stage
                  );

                  const nextStatus = getRunProgress(
                    run.id
                  );

                  sendEvent("job_stage", {
                    runId: run.id,
                    jobId: job.id,
                    email: job.account.email,
                    stage,
                    status: updatedJob?.status ?? job.status,
                    retryCount: updatedJob?.retryCount ?? job.retryCount,
                    error: updatedJob?.error,
                    progress: nextStatus,
                    job: updatedJob
                      ? toPublicJob(updatedJob)
                      : undefined,
                  });
                }
              );

              for (const result of results) {
                updateJobResult(result);
              }

              allResults.push(...results);

              const batchProgress = getRunProgress(
                run.id
              );

              updateRunStatus(
                run.id,
                batchProgress.status
              );

              sendEvent("batch_completed", {
                runId: run.id,
                batch: batchNumber,
                totalBatches: batches.length,
                status: batchProgress.status,
                progress: batchProgress,
                results: results.map(toPublicJob),
              });
            }

            const finalStatus = syncRunStatus(run.id) ?? {
              status: allResults.some(
                (job) => job.status === "failed"
              )
                ? "failed"
                : "completed",
            };

            updateRunStatus(run.id, finalStatus.status);

            sendEvent("automation_completed", {
              runId: run.id,
              status: finalStatus.status,
              totalJobs: allResults.length,
              results: allResults.map(toPublicJob),
              progress: getRunProgress(run.id),
            });
          } catch (error) {
            console.error("Automation failed:", error);

            if (runId) {
              updateRunStatus(runId, "failed");
            }

            sendEvent("automation_error", {
              runId,
              message:
                error instanceof Error
                  ? error.message
                  : "Unknown server error",
            });
          } finally {
            controller.close();
          }
        };

        void runAutomation();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Request processing failed:", error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}