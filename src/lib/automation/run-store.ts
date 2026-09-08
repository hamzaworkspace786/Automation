export type AutomationRun = {
  id: string;
  targetUrl: string;
  totalJobs: number;
  totalBatches: number;
  status: "running" | "completed" | "failed";
  createdAt: string;
};

const runs = new Map<
  string,
  AutomationRun
>();

export function createRun(
  targetUrl: string,
  totalJobs: number,
  totalBatches: number
): AutomationRun {
  const run: AutomationRun = {
    id: `run-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    targetUrl,
    totalJobs,
    totalBatches,
    status: "running",
    createdAt: new Date().toISOString(),
  };

  runs.set(run.id, run);

  return run;
}

export function updateRunStatus(
  runId: string,
  status: AutomationRun["status"]
): AutomationRun | undefined {
  const run = runs.get(runId);

  if (!run) {
    return undefined;
  }

  const updatedRun: AutomationRun = {
    ...run,
    status,
  };

  runs.set(runId, updatedRun);

  return updatedRun;
}

export function getRun(
  runId: string
): AutomationRun | undefined {
  return runs.get(runId);
}