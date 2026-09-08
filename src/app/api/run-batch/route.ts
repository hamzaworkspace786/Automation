import { createBatches } from "@/lib/batching";
import { createJobs } from "@/lib/automation/jobs";
import { runBatch } from "@/lib/automation/batch-runner";
import {
  initializeJobs,
  updateJobResult,
  updateJobStage,
} from "@/lib/automation/job-store";
import {
  createRun,
  updateRunStatus,
} from "@/lib/automation/run-store";
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
    } = body;

    if (
      !targetUrl ||
      !Array.isArray(accounts) ||
      accounts.length === 0
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Target URL and accounts are required",
        }),
        {
          status: 400,
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const encoder = new TextEncoder();

    const stream =
      new ReadableStream({
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

          const runAutomation =
            async () => {
              let runId:
                | string
                | undefined;

              try {
                console.log(
                  `Received ${accounts.length} accounts`
                );

                const totalBatches =
                  Math.ceil(
                    accounts.length / 5
                  );

                const run = createRun(
                  targetUrl,
                  accounts.length,
                  totalBatches
                );

                runId = run.id;

                const jobs =
                  createJobs(
                    accounts,
                    run.id
                  );

                const batches =
                  createBatches(
                    jobs,
                    5
                  );

                initializeJobs(jobs);

                console.log(
                  `Created automation run: ${run.id}`
                );

                console.log(
                  `Created ${batches.length} batches`
                );

                sendEvent(
                  "connected",
                  {
                    message:
                      "Automation started",
                    runId: run.id,
                    totalJobs:
                      jobs.length,
                    totalBatches:
                      batches.length,
                  }
                );

                const allResults = [];

                for (
                  const [
                    index,
                    batch,
                  ] of batches.entries()
                ) {
                  const batchNumber =
                    index + 1;

                  console.log(
                    `Processing batch ${batchNumber}`
                  );

                  sendEvent(
                    "batch_started",
                    {
                      runId: run.id,
                      batch:
                        batchNumber,
                      totalBatches:
                        batches.length,
                      jobs:
                        batch.length,
                    }
                  );

                  const results =
                    await runBatch(
                      batch,
                      targetUrl,
                      (
                        job,
                        stage
                      ) => {
                        const updatedJob =
                          updateJobStage(
                            job.id,
                            stage
                          );

                        console.log(
                          `LIVE UPDATE → ${job.id} → ${stage}`
                        );

                        sendEvent(
                          "job_stage",
                          {
                            runId:
                              run.id,
                            jobId:
                              job.id,
                            email:
                              job
                                .account
                                .email,
                            stage,
                            job:
                              updatedJob,
                          }
                        );
                      }
                    );

                  for (
                    const result of results
                  ) {
                    updateJobResult(
                      result
                    );
                  }

                  allResults.push(
                    ...results
                  );

                  sendEvent(
                    "batch_completed",
                    {
                      runId: run.id,
                      batch:
                        batchNumber,
                      totalBatches:
                        batches.length,
                      results,
                    }
                  );
                }

                updateRunStatus(
                  run.id,
                  "completed"
                );

                sendEvent(
                  "automation_completed",
                  {
                    runId: run.id,
                    totalJobs:
                      allResults.length,
                    results:
                      allResults,
                  }
                );

                console.log(
                  `Automation run completed: ${run.id}`
                );
              } catch (error) {
                console.error(
                  "Automation failed:",
                  error
                );

                if (runId) {
                  updateRunStatus(
                    runId,
                    "failed"
                  );
                }

                sendEvent(
                  "automation_error",
                  {
                    runId,
                    message:
                      error instanceof
                      Error
                        ? error.message
                        : "Unknown server error",
                  }
                );
              } finally {
                controller.close();
              }
            };

          void runAutomation();
        },
      });

    return new Response(
      stream,
      {
        headers: {
          "Content-Type":
            "text/event-stream",
          "Cache-Control":
            "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }
    );
  } catch (error) {
    console.error(
      "Request processing failed:",
      error
    );

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
          "Content-Type":
            "application/json",
        },
      }
    );
  }
}