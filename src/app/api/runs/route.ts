import { getAllRuns } from "@/lib/automation/run-store";

export async function GET() {
  try {
    const runs = getAllRuns();

    return Response.json({
      runs,
      count: runs.length,
    });
  } catch (error) {
    console.error("Failed to retrieve run history:", error);

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
