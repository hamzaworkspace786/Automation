import {
  getRun,
  getRunProgress,
  syncRunStatus,
} from "@/lib/automation/run-store";
import { getJobsForRun } from "@/lib/automation/job-store";

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { runId } = await context.params;

    const run = getRun(runId);

    if (!run) {
      return Response.json(
        {
          error: "Automation run not found",
        },
        {
          status: 404,
        }
      );
    }

    const jobs = getJobsForRun(runId);
    const progress = getRunProgress(runId, jobs);
    const updatedRun = syncRunStatus(runId) ?? run;

    return Response.json({
      run: {
        id: updatedRun.id,
        status: updatedRun.status,
        totalJobs: updatedRun.totalJobs,
        totalBatches: updatedRun.totalBatches,
        createdAt: updatedRun.createdAt,
      },
      progress: {
        percentage: progress.percentage,
        pending: progress.pending,
        running: progress.running,
        success: progress.success,
        failed: progress.failed,
        completed: progress.completed,
        total: progress.total,
      },
    });
  } catch (error) {
    console.error(
      "Failed to retrieve run progress:",
      error
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error",
      },
      {
        status: 500,
      }
    );
  }
}