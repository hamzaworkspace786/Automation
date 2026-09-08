import { getRun } from "@/lib/automation/run-store";
import { getAllJobs } from "@/lib/automation/job-store";

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

    const jobs = getAllJobs().filter(
      (job) => job.runId === runId
    );

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

    const progress =
      jobs.length > 0
        ? Math.round(
            (completed / jobs.length) * 100
          )
        : 0;

    return Response.json({
      run: {
        id: run.id,
        status: run.status,
        totalJobs: run.totalJobs,
        totalBatches: run.totalBatches,
        createdAt: run.createdAt,
      },
      progress: {
        percentage: progress,
        pending,
        running,
        success,
        failed,
        completed,
        total: jobs.length,
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