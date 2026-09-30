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
  // Verify and log actual proxy IP address
  try {
    const response = await context.request.get("https://ipinfo.io/json", { timeout: 5000 });
    if (response.ok()) {
      const ipData = (await response.json()) as { ip?: string; city?: string; country?: string };
      console.log(
        `[IP Verified] Account ${job.account.email} -> IP: ${ipData.ip ?? "Unknown"} | Location: ${ipData.city ?? "Unknown"}, ${ipData.country ?? "Unknown"}`
      );
    }
  } catch {
    // Fallback silently if the IP lookup service times out
  }

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