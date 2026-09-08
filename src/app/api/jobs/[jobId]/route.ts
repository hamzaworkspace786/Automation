import { getJob } from "@/lib/automation/job-store";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { jobId } = await context.params;

    const job = getJob(jobId);

    if (!job) {
      return Response.json(
        {
          error: "Job not found",
        },
        {
          status: 404,
        }
      );
    }

    return Response.json({
      job,
    });
  } catch (error) {
    console.error(
      "Failed to retrieve job:",
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