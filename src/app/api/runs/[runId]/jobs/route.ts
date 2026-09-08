import { getRun } from "@/lib/automation/run-store";
import { getJobsForRun } from "@/lib/automation/job-store";
import { toPublicJob } from "@/lib/automation/jobs";
import { getRunProgress } from "@/lib/automation/run-store";

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

    return Response.json({
      runId,
      run,
      totalJobs: jobs.length,
      progress: {
        percentage: progress.percentage,
        pending: progress.pending,
        running: progress.running,
        success: progress.success,
        failed: progress.failed,
        completed: progress.completed,
        total: progress.total,
      },
      counts: {
        pending: progress.pending,
        running: progress.running,
        success: progress.success,
        failed: progress.failed,
        completed: progress.completed,
      },
      jobs: jobs.map(toPublicJob),
    });
  } catch (error) {
    console.error(
      "Failed to retrieve run jobs:",
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