import type {
  Account,
  AutomationJob,
} from "@/types/automation";

export function createJobs(
  accounts: Account[],
  runId: string
): AutomationJob[] {
  return accounts.map((account, index) => ({
    id: `job-${Date.now()}-${index + 1}`,
    runId,
    account,
    status: "pending",
    stage: "pending",
  }));
}