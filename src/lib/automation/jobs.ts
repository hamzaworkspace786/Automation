import type {
  Account,
  AutomationJob,
} from "@/types/automation";

export type PublicAutomationJob = Omit<AutomationJob, "account"> & {
  account: Pick<Account, "email">;
};

export function toPublicJob(
  job: AutomationJob
): PublicAutomationJob {
  return {
    ...job,
    account: {
      email: job.account.email,
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
  }));
}