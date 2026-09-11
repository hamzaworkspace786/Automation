export type Account = {
  email: string;
  password?: string;
};

export type AutomationMode =
  | "visit-only"
  | "authenticate"
  | "reuse-session";

export type RunStatus =
  | "running"
  | "completed"
  | "failed";

export type JobStatus =
  | "pending"
  | "running"
  | "success"
  | "failed";

export type JobStage =
  | "pending"
  | "opening"
  | "authenticating"
  | "auth-expired"
  | "manual-verification-required"
  | "post-authentication"
  | "retrying"
  | "completed"
  | "failed";

export type AutomationJob = {
  id: string;
  runId: string;
  account: Account;
  status: JobStatus;
  stage: JobStage;
  error?: string;
  retryable?: boolean;
  retryCount: number;
  maxRetries: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
};

export type AutomationRun = {
  id: string;
  targetUrl: string;
  mode: AutomationMode;
  totalJobs: number;
  totalBatches: number;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
};

export type AutomationRequest = {
  targetUrl: string;
  accounts: Account[];
  mode?: AutomationMode;
};

export type AutomationAccount = {
  email: string;
  password?: string;
};