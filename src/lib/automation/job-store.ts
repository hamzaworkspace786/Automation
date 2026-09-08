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

  const nextTimestamp = new Date().toISOString();

  const updatedJob: AutomationJob = {
    ...job,
    stage,
    status:
      stage === "completed"
        ? "success"
        : stage === "failed"
          ? "failed"
          : stage === "retrying"
            ? "pending"
            : "running",
    updatedAt: nextTimestamp,
    startedAt:
      job.startedAt ??
      (stage === "opening" || stage === "authenticating" || stage === "post-authentication" || stage === "retrying"
        ? nextTimestamp
        : job.startedAt),
    completedAt:
      stage === "completed" || stage === "failed"
        ? nextTimestamp
        : job.completedAt,
  };

  jobs.set(jobId, updatedJob);

  return updatedJob;
}

export function updateJobResult(
  job: AutomationJob
): AutomationJob {
  const nextJob: AutomationJob = {
    ...job,
    startedAt: job.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt:
      job.status === "success" || job.status === "failed"
        ? new Date().toISOString()
        : job.completedAt,
  };

  jobs.set(job.id, nextJob);

  return nextJob;
}

export function getJob(
  jobId: string
): AutomationJob | undefined {
  return jobs.get(jobId);
}

export function getAllJobs(): AutomationJob[] {
  return Array.from(jobs.values());
}

export function getJobsForRun(
  runId: string
): AutomationJob[] {
  return getAllJobs().filter(
    (job) => job.runId === runId
  );
}