import type { BrowserContext } from "playwright";
import type { AutomationJob, AutomationMode, JobStage } from "@/types/automation";
import { runWorkflow } from "./workflow";

export type JobStageCallback = (job: AutomationJob, stage: JobStage) => void;

export async function runAutomationJob(
  job: AutomationJob,
  context: BrowserContext,
  targetUrl: string,
  mode: AutomationMode,
  onStage?: JobStageCallback
): Promise<AutomationJob> {
  const result = await runWorkflow(
    job.account,
    context,
    targetUrl,
    mode,
    (stage) => onStage?.(job, stage),
    job.categoryIndex ?? 0
  );

  if (result.success) {
    return {
      ...job,
      status: "success",
      stage: "completed",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  }

  return {
    ...job,
    status: "failed",
    stage: result.failureStage ?? "failed",
    error: result.message,
    retryable: result.retryable ?? false,
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}