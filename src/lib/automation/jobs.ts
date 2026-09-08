import type {
  Account,
  AutomationJob,
} from "@/types/automation";
import {
  AUTOMATION_MAX_RETRIES,
} from "@/lib/batching";

export type PublicAutomationJob = Omit<AutomationJob, "account"> & {
  account: Pick<Account, "email">;
};

export function toPublicJob(
  job: AutomationJob
): PublicAutomationJob {
  const accountWithoutPassword = {
    email: job.account.email,
  };

  return {
    ...job,
    account: {
      email: accountWithoutPassword.email,
    },
  };
}

export function createJobs(
  accounts: Account[],
  runId: string
): AutomationJob[] {
  return accounts.map((account, index) => ({
    id: `${runId}-job-${index + 1}`,
    runId,
    account,
    status: "pending",
    stage: "pending",
    retryCount: 0,
    maxRetries: AUTOMATION_MAX_RETRIES,
    startedAt: undefined,
    completedAt: undefined,
    updatedAt: new Date().toISOString(),
  }));
}