import type {
  AutomationJob,
  JobStage,
} from "@/types/automation";

const jobs = new Map<
  string,
  AutomationJob
>();

export function initializeJobs(
  automationJobs: AutomationJob[]
): void {
  for (const job of automationJobs) {
    jobs.set(job.id, job);
  }
}

export function updateJobStage(
  jobId: string,
  stage: JobStage
): AutomationJob | undefined {
  const job = jobs.get(jobId);

  if (!job) {
    return undefined;
  }

  const updatedJob: AutomationJob = {
    ...job,
    stage,
    status:
      stage === "completed"
        ? "success"
        : stage === "failed"
          ? "failed"
          : "running",
  };

  jobs.set(jobId, updatedJob);

  return updatedJob;
}

export function updateJobResult(
  job: AutomationJob
): AutomationJob {
  jobs.set(job.id, job);

  return job;
}

export function getJob(
  jobId: string
): AutomationJob | undefined {
  return jobs.get(jobId);
}

export function getAllJobs(): AutomationJob[] {
  return Array.from(jobs.values());
}