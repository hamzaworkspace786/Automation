import type {
  AutomationJob,
  AutomationRun,
  RunStatus,
} from "@/types/automation";
import { getJobsForRun } from "@/lib/automation/job-store";

const runs = new Map<
  string,
  AutomationRun
>();

export function createRun(
  targetUrl: string,
  totalJobs: number,
  totalBatches: number
): AutomationRun {
  const now = new Date().toISOString();

  const run: AutomationRun = {
    id: `run-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    targetUrl,
    totalJobs,
    totalBatches,
    status: "running",
    createdAt: now,
    startedAt: now,
    updatedAt: now,
  };

  runs.set(run.id, run);

  return run;
}

export function updateRunStatus(
  runId: string,
  status: RunStatus
): AutomationRun | undefined {
  const run = runs.get(runId);

  if (!run) {
    return undefined;
  }

  const now = new Date().toISOString();

  const updatedRun: AutomationRun = {
    ...run,
    status,
    updatedAt: now,
    completedAt:
      status === "completed" || status === "failed"
        ? now
        : run.completedAt,
  };

  runs.set(runId, updatedRun);

  return updatedRun;
}

export function getRun(
  runId: string
): AutomationRun | undefined {
  return runs.get(runId);
}

export function getRunProgress(
  runId: string,
  jobs: AutomationJob[] = getJobsForRun(runId)
) {
  const total = jobs.length;
  const pending = jobs.filter(
    (job) => job.status === "pending"
  ).length;
  const running = jobs.filter(
    (job) => job.status === "running"
  ).length;
  const success = jobs.filter(
    (job) => job.status === "success"
  ).length;
  const failed = jobs.filter(
    (job) => job.status === "failed"
  ).length;
  const completed = success + failed;
  const percentage =
    total > 0
      ? Math.round(
          (completed / total) * 100
        )
      : 0;

  let status: RunStatus = "running";

  if (total === 0) {
    status = "completed";
  } else if (
    jobs.some(
      (job) => job.status === "running"
    )
  ) {
    status = "running";
  } else if (
    failed > 0 &&
    running === 0 &&
    pending === 0
  ) {
    status = "failed";
  } else if (
    completed === total &&
    failed === 0
  ) {
    status = "completed";
  } else if (
    failed > 0 &&
    completed === total
  ) {
    status = "failed";
  }

  return {
    total,
    pending,
    running,
    success,
    failed,
    completed,
    percentage,
    status,
  };
}

export function syncRunStatus(
  runId: string
): AutomationRun | undefined {
  const run = runs.get(runId);

  if (!run) {
    return undefined;
  }

  const progress = getRunProgress(
    runId,
    getJobsForRun(runId)
  );

  return updateRunStatus(
    runId,
    progress.status
  );
}

export function getAllRuns(): AutomationRun[] {
  return Array.from(runs.values()).sort(
    (left, right) =>
      new Date(right.createdAt).getTime() -
      new Date(left.createdAt).getTime()
  );
}