export type Account = {
  email: string;
  password: string;
};

export type JobStatus =
  | "pending"
  | "running"
  | "success"
  | "failed";

export type JobStage =
  | "pending"
  | "opening"
  | "authenticating"
  | "post-authentication"
  | "completed"
  | "failed";

export type AutomationJob = {
  id: string;
  runId: string;
  account: Account;
  status: JobStatus;
  stage: JobStage;
  error?: string;
};

export type AutomationRequest = {
  targetUrl: string;
  accounts: Account[];
};