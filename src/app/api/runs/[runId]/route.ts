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

    return Response.json({
      run,
      jobs,
    });
  } catch (error) {
    console.error(
      "Failed to retrieve automation run:",
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