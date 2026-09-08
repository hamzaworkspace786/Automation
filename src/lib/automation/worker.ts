import type { BrowserContext } from "playwright";
import type {
  AutomationJob,
  JobStage,
} from "@/types/automation";
import { runWorkflow } from "./workflow";

export type JobStageCallback = (
  job: AutomationJob,
  stage: JobStage
) => void;

export async function runAutomationJob(
  job: AutomationJob,
  context: BrowserContext,
  targetUrl: string,
  onStage?: JobStageCallback
): Promise<AutomationJob> {
  console.log(
    `Starting job: ${job.id}`
  );

  onStage?.(job, "opening");

  const result = await runWorkflow(
    job.account,
    context,
    targetUrl,
    (stage) => {
      onStage?.(job, stage);
    }
  );

  if (result.success) {
    return {
      ...job,
      status: "success",
      stage: "completed",
    };
  }

  return {
    ...job,
    status: "failed",
    stage: "failed",
    error: result.message,
  };
}