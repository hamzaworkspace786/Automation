import type { BrowserContext } from "playwright";
import type {
  AutomationJob,
  AutomationMode,
  JobStage,
} from "@/types/automation";
import { runWorkflow } from "./workflow";
import { sanitizeErrorMessage } from "./validation";

export type JobStageCallback = (
  job: AutomationJob,
  stage: JobStage
) => void;

export async function runAutomationJob(
  job: AutomationJob,
  context: BrowserContext,
  targetUrl: string,
  mode: AutomationMode = "authenticate",
  onStage?: JobStageCallback
): Promise<AutomationJob> {
  console.log(
    `Starting job: ${job.id}`
  );

  const startedAt = new Date().toISOString();

  onStage?.({
    ...job,
    status: "running",
    stage: "opening",
    startedAt,
    updatedAt: startedAt,
  }, "opening");

  const result = await runWorkflow(
    job.account,
    context,
    targetUrl,
    mode,
    (stage) => {
      onStage?.({
        ...job,
        status:
          stage === "completed"
            ? "success"
            : stage === "failed" || stage === "auth-expired"
              ? "failed"
              : "running",
        stage,
        startedAt: job.startedAt ?? startedAt,
        updatedAt: new Date().toISOString(),
      }, stage);
    }
  );

  if (result.success) {
    const completedAt = new Date().toISOString();

    return {
      ...job,
      status: "success",
      stage: "completed",
      error: undefined,
      startedAt: job.startedAt ?? startedAt,
      completedAt,
      updatedAt: completedAt,
    };
  }

  const message = sanitizeErrorMessage(result.message);
  const failureStage = result.failureStage ?? "failed";

  return {
    ...job,
    status: "failed",
    stage: failureStage,
    error: message,
    retryable: result.retryable,
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}