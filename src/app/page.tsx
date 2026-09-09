"use client";

import { useEffect, useMemo, useState } from "react";

type JobUpdate = {
  jobId: string;
  email: string;
  stage: string;
  status?: string;
  retryCount?: number;
};

type ProgressResponse = {
  run: {
    id: string;
    status: "running" | "completed" | "failed";
    totalJobs: number;
    totalBatches: number;
    createdAt: string;
  };
  progress: {
    percentage: number;
    pending: number;
    running: number;
    success: number;
    failed: number;
    completed: number;
    total: number;
  };
};

type RunSummary = {
  id: string;
  targetUrl: string;
  mode: "visit-only" | "authenticate";
  totalJobs: number;
  status: "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
};

type JobDetail = {
  id: string;
  runId: string;
  account: { email: string };
  status: string;
  stage: string;
  error?: string;
  retryCount?: number;
  maxRetries?: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
};

export default function Home() {
  const [targetUrl, setTargetUrl] = useState(
    "https://share.google/nGDUcwrYZ6wG3lRvP",
  );
  const [executionMode, setExecutionMode] = useState<
    "visit-only" | "authenticate"
  >("authenticate");
  const [accountsText, setAccountsText] = useState("");

  const [updates, setUpdates] = useState<JobUpdate[]>([]);
  const [status, setStatus] = useState("Ready");
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunJobs, setSelectedRunJobs] = useState<JobDetail[]>([]);
  const [jobFilter, setJobFilter] = useState<
    "all" | "pending" | "running" | "success" | "failed" | "completed"
  >("all");

  const [totalJobs, setTotalJobs] = useState(0);
  const [pendingJobs, setPendingJobs] = useState(0);
  const [runningJobs, setRunningJobs] = useState(0);
  const [successfulJobs, setSuccessfulJobs] = useState(0);
  const [failedJobs, setFailedJobs] = useState(0);
  const [completedJobs, setCompletedJobs] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const savedRunId = sessionStorage.getItem("automationRunId");

    if (!savedRunId) return;

    const restoreRun = async () => {
      setRunId(savedRunId);
      setStatus("Restoring previous run...");
      try {
        const response = await fetch(`/api/runs/${savedRunId}/jobs`, {
          cache: "no-store",
        });

        if (!response.ok) {
          if (response.status === 404) {
            sessionStorage.removeItem("automationRunId");

            setRunId(null);
            setStatus("Ready");
          }

          return;
        }

        const data = await response.json();

        const restoredUpdates: JobUpdate[] = data.jobs.map(
          (job: { id: string; account: { email: string }; stage: string }) => ({
            jobId: job.id,
            email: job.account.email,
            stage: job.stage,
          }),
        );

        setUpdates(restoredUpdates);
        setTotalJobs(data.totalJobs);

        const successful = data.jobs.filter(
          (job: { status: string }) => job.status === "success",
        ).length;

        const failed = data.jobs.filter(
          (job: { status: string }) => job.status === "failed",
        ).length;

        const running = data.jobs.filter(
          (job: { status: string }) => job.status === "running",
        ).length;

        const pending = data.jobs.filter(
          (job: { status: string }) => job.status === "pending",
        ).length;

        const completed = successful + failed;

        const restoredProgress =
          data.totalJobs > 0
            ? Math.round((completed / data.totalJobs) * 100)
            : 0;

        setSuccessfulJobs(successful);
        setFailedJobs(failed);
        setRunningJobs(running);
        setPendingJobs(pending);
        setCompletedJobs(completed);
        setProgress(restoredProgress);

        const finished =
          data.jobs.length > 0 &&
          data.jobs.every(
            (job: { status: string }) =>
              job.status === "success" || job.status === "failed",
          );

        if (finished) {
          setIsRunning(false);
          setStatus("Previous run completed");
        } else {
          setIsRunning(true);
          setStatus("Previous run is active");
        }
      } catch (error) {
        console.error("Failed to restore run:", error);

        setStatus("Could not restore previous run");
      }
    };

    void restoreRun();
  }, []);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await fetch("/api/runs", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();

        setHistory(data.runs ?? []);
      } catch (error) {
        console.error("Run history load failed:", error);
      }
    };

    void loadHistory();
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }

    const loadRunDetails = async () => {
      try {
        const response = await fetch(`/api/runs/${selectedRunId}/jobs`, {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();
        setSelectedRunJobs(data.jobs ?? []);
      } catch (error) {
        console.error("Run details load failed:", error);
      }
    };

    void loadRunDetails();
  }, [selectedRunId]);

  const filteredJobs = useMemo(() => {
    if (jobFilter === "all") return selectedRunJobs;

    if (jobFilter === "completed") {
      return selectedRunJobs.filter(
        (job) => job.status === "success" || job.status === "failed",
      );
    }

    return selectedRunJobs.filter((job) => job.status === jobFilter);
  }, [jobFilter, selectedRunJobs]);

  useEffect(() => {
    if (!runId) return;

    let active = true;

    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/runs/${runId}/progress`, {
          cache: "no-store",
        });

        if (!response.ok || !active) return;

        const data: ProgressResponse = await response.json();

        if (!active) return;

        setTotalJobs(data.progress.total);
        setPendingJobs(data.progress.pending);
        setRunningJobs(data.progress.running);
        setSuccessfulJobs(data.progress.success);
        setFailedJobs(data.progress.failed);
        setCompletedJobs(data.progress.completed);
        setProgress(data.progress.percentage);

        if (data.run.status === "running") {
          setIsRunning(true);
          setStatus("Automation running...");
        }

        if (data.run.status === "completed") {
          setIsRunning(false);
          setStatus("Automation completed");
        }

        if (data.run.status === "failed") {
          setIsRunning(false);
          setStatus("Automation failed");
        }
      } catch (error) {
        console.error("Progress polling failed:", error);
      }
    };

    void pollProgress();

    const interval = window.setInterval(pollProgress, 2000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [runId]);

  const handleRetryJob = async (jobId: string) => {
    if (!selectedRunId) return;

    try {
      const response = await fetch(
        `/api/runs/${selectedRunId}/jobs/${jobId}/retry`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.error || "Retry failed");
        return;
      }

      setStatus(`Retry completed for ${jobId}`);

      const refreshed = await fetch(`/api/runs/${selectedRunId}/jobs`, {
        cache: "no-store",
      });

      if (refreshed.ok) {
        const payload = await refreshed.json();
        setSelectedRunJobs(payload.jobs ?? []);
      }
    } catch (error) {
      console.error("Retry request failed:", error);
      setStatus("Retry request failed");
    }
  };

  const handleStart = async () => {
    if (!targetUrl.trim()) {
      setStatus("Enter a target URL first");
      return;
    }

    if (!accountsText.trim()) {
      setStatus("Enter at least one account");
      return;
    }

    const accounts = accountsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email, ...rest] = line.split(",");

        return {
          email: email?.trim() ?? "",
          password: rest.join(",").trim(),
        };
      });

    sessionStorage.removeItem("automationRunId");

    setRunId(null);
    setUpdates([]);

    setTotalJobs(accounts.length);
    setPendingJobs(accounts.length);
    setRunningJobs(0);
    setSuccessfulJobs(0);
    setFailedJobs(0);
    setCompletedJobs(0);
    setProgress(0);

    setIsRunning(true);
    setStatus("Starting automation...");

    try {
      const parsedAccounts = accountsText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [email, ...rest] = line.split(",");

          return {
            email: email?.trim() ?? "",
            ...(executionMode === "authenticate"
              ? { password: rest.join(",").trim() }
              : {}),
          };
        });

      if (parsedAccounts.length === 0) {
        setStatus("Enter at least one valid account");
        setIsRunning(false);
        return;
      }

      const response = await fetch("/api/run-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetUrl,
          accounts: parsedAccounts,
          mode: executionMode,
        }),
      });

      if (!response.ok) {
        const data = await response.json();

        setStatus(data.error || "Failed to start automation");

        setIsRunning(false);
        return;
      }

      if (!response.body) {
        setStatus("No streaming response received");

        setIsRunning(false);
        return;
      }

      const reader = response.body.getReader();

      const decoder = new TextDecoder();

      let buffer = "";
      let retryCount = 0;
      const maxReconnectAttempts = 5;

      const streamEvents = async () => {
        while (true) {
          const { value, done } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, {
            stream: true,
          });

          const events = buffer.split("\n\n");

          buffer = events.pop() ?? "";

          for (const eventBlock of events) {
            const lines = eventBlock.split("\n");

            let eventName = "";
            let eventData = "";

            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventName = line.replace("event:", "").trim();
              }

              if (line.startsWith("data:")) {
                eventData = line.replace("data:", "").trim();
              }
            }

            if (!eventData) continue;

            try {
              const data = JSON.parse(eventData);

              if (eventName === "connected") {
                setRunId(data.runId);

                sessionStorage.setItem("automationRunId", data.runId);
                setSelectedRunId(data.runId);
                setTotalJobs(data.totalJobs);

                setStatus("Automation started");
              }

              if (eventName === "batch_started") {
                setStatus(
                  `Processing batch ${data.batch} of ${data.totalBatches}`,
                );
              }

              if (eventName === "job_stage") {
                const update: JobUpdate = {
                  jobId: data.jobId,
                  email: data.email,
                  stage: data.stage,
                  status: data.status,
                  retryCount: data.retryCount,
                };

                setUpdates((previous) => {
                  const existingIndex = previous.findIndex(
                    (item) => item.jobId === update.jobId,
                  );

                  if (existingIndex === -1) {
                    return [...previous, update];
                  }

                  const next = [...previous];

                  next[existingIndex] = {
                    ...next[existingIndex],
                    ...update,
                  };

                  return next;
                });
              }

              if (eventName === "automation_completed") {
                setIsRunning(false);
                setStatus("Automation completed");
                retryCount = 0;
              }

              if (eventName === "automation_error") {
                setIsRunning(false);
                setStatus(data.message || "Automation failed");
                retryCount = 0;
              }
            } catch (error) {
              console.error("Failed to parse SSE:", error);
            }
          }
        }
      };

      try {
        await streamEvents();
      } catch (error) {
        console.error("Automation stream failed:", error);
      }

      if (retryCount < maxReconnectAttempts && runId) {
        retryCount += 1;
        setStatus("Connection lost, reconnecting...");

        const recovery = await fetch(`/api/runs/${runId}/progress`, {
          cache: "no-store",
        });

        if (recovery.ok) {
          const next = await recovery.json();
          setTotalJobs(next.progress.total);
          setPendingJobs(next.progress.pending);
          setRunningJobs(next.progress.running);
          setSuccessfulJobs(next.progress.success);
          setFailedJobs(next.progress.failed);
          setCompletedJobs(next.progress.completed);
          setProgress(next.progress.percentage);
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1000));

        return;
      }

      setIsRunning(false);
      setStatus("Connection closed");
    } catch (error) {
      console.error("Automation request failed:", error);

      setIsRunning(false);
      setStatus("Failed to connect to automation server");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100 md:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-10 flex items-center justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-lg font-bold shadow-lg shadow-indigo-500/20">
                A
              </div>

              <span className="text-sm font-medium uppercase tracking-[0.25em] text-indigo-400">
                Automation
              </span>
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-white">
              Automation Dashboard
            </h1>

            <p className="mt-2 text-slate-400">
              Manage and monitor your authorized automation runs.
            </p>
          </div>

          <div className="hidden items-center gap-3 rounded-full border border-slate-800 bg-slate-900 px-4 py-2 md:flex">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isRunning ? "animate-pulse bg-emerald-400" : "bg-slate-500"
              }`}
            />

            <span className="text-sm text-slate-300">
              {isRunning ? "System Running" : "System Ready"}
            </span>
          </div>
        </header>

        {/* Input Card */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20 backdrop-blur md:p-8">
          <div className="mb-7">
            <h2 className="text-xl font-semibold text-white">
              Create Automation Run
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Configure the target and authorized test accounts.
            </p>
          </div>

          <div className="space-y-6">
            {/* URL */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Target URL
              </label>

              <input
                type="url"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                placeholder="http://localhost:3000/test-site"
                disabled={isRunning}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              />

              <p className="mt-2 text-xs text-slate-500">
                The browser will open this URL in a visible Chrome window.
              </p>
            </div>

            <div>
              <label
                htmlFor="execution-mode"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Run mode
              </label>

              <select
                id="execution-mode"
                value={executionMode}
                onChange={(event) =>
                  setExecutionMode(
                    event.target.value as "visit-only" | "authenticate",
                  )
                }
                disabled={isRunning}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="visit-only">Visit URL only</option>
                <option value="authenticate">Authenticate after opening</option>
              </select>
            </div>

            {/* Accounts */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">
                  Accounts
                </label>

                <span className="text-xs text-slate-500">
                  one account per line
                </span>
              </div>

              <textarea
                value={accountsText}
                onChange={(event) => setAccountsText(event.target.value)}
                placeholder={
                  executionMode === "visit-only"
                    ? "hamzasworkspace1@gmail.com"
                    : "email1@example.com,password1\nemail2@example.com,password2"
                }
                disabled={isRunning}
                className="h-48 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 font-mono text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              />

              <p className="mt-2 text-xs text-slate-500">
                {executionMode === "visit-only"
                  ? "Enter one email per line. No password is required for visit-only mode."
                  : "Enter one email,password pair per line."}
              </p>
            </div>

            {/* Start */}
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-slate-500">
                {totalJobs > 0
                  ? `${totalJobs} account${totalJobs === 1 ? "" : "s"} loaded`
                  : "No accounts loaded"}
              </p>

              <button
                onClick={handleStart}
                disabled={isRunning}
                className="rounded-xl bg-indigo-500 px-7 py-3.5 font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isRunning ? "Automation Running..." : "Start Automation"}
              </button>
            </div>
          </div>
        </section>

        {/* Run Status */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20 md:p-8">
          <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-sm font-medium text-indigo-400">RUN STATUS</p>

              <h2 className="mt-1 text-2xl font-bold text-white">{status}</h2>
            </div>

            {runId && (
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2">
                <span className="text-xs text-slate-500">RUN ID</span>

                <p className="max-w-75 truncate font-mono text-xs text-slate-300">
                  {runId}
                </p>
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="mb-3 flex justify-between">
              <span className="text-sm font-medium text-slate-300">
                Overall Progress
              </span>

              <span className="text-sm font-bold text-white">{progress}%</span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          </div>

          {/* Counters */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[
              ["Total", totalJobs],
              ["Pending", pendingJobs],
              ["Running", runningJobs],
              ["Success", successfulJobs],
              ["Failed", failedJobs],
              ["Completed", completedJobs],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-800 bg-slate-950 p-4"
              >
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {label}
                </p>

                <p className="mt-2 text-2xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Job Updates */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20 md:p-8">
          <div className="mb-6">
            <p className="text-sm font-medium text-indigo-400">LIVE ACTIVITY</p>

            <h2 className="mt-1 text-2xl font-bold text-white">Job Updates</h2>
          </div>

          {updates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-10 text-center">
              <p className="text-slate-500">No job activity yet.</p>

              <p className="mt-1 text-xs text-slate-600">
                Start an automation run to see live updates.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {updates.map((update) => (
                <div
                  key={update.jobId}
                  className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4 transition hover:border-slate-700 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">
                      {update.email}
                    </p>

                    <p className="mt-1 truncate font-mono text-xs text-slate-600">
                      {update.jobId}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {typeof update.retryCount === "number" &&
                      update.retryCount > 0 && (
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                          retry {update.retryCount}
                        </span>
                      )}
                    <span className="w-fit rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium capitalize text-indigo-400">
                      {update.stage}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20 md:p-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-indigo-400">RUN HISTORY</p>
              <h2 className="mt-1 text-2xl font-bold text-white">
                Recent runs
              </h2>
            </div>

            <button
              type="button"
              onClick={async () => {
                const response = await fetch("/api/runs", {
                  cache: "no-store",
                });

                if (response.ok) {
                  const data = await response.json();
                  setHistory(data.runs ?? []);
                }
              }}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            >
              Refresh
            </button>
          </div>

          {history.length === 0 ? (
            <p className="text-slate-400">No runs recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedRunId === run.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-800 bg-slate-950 hover:border-slate-700"
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-mono text-xs text-slate-400">
                        {run.id}
                      </p>
                      <p className="mt-1 text-sm text-slate-200">
                        {run.targetUrl}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                        {run.totalJobs} jobs
                      </span>
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                        {run.status}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedRunId && (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/20 md:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-indigo-400">
                  RUN DETAILS
                </p>
                <h2 className="mt-1 text-2xl font-bold text-white">
                  {selectedRunId}
                </h2>
              </div>
              <select
                value={jobFilter}
                onChange={(event) =>
                  setJobFilter(event.target.value as typeof jobFilter)
                }
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="space-y-3">
              {filteredJobs.length === 0 ? (
                <p className="text-slate-400">No jobs match this filter.</p>
              ) : (
                filteredJobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium text-white">
                          {job.account.email}
                        </p>
                        <p className="mt-1 font-mono text-xs text-slate-500">
                          {job.id}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-300">
                          {job.status}
                        </span>
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">
                          {job.stage}
                        </span>
                        {typeof job.retryCount === "number" &&
                          job.retryCount > 0 && (
                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-wide text-amber-300">
                              retry {job.retryCount}
                            </span>
                          )}
                      </div>
                    </div>
                    {job.error && (
                      <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
                        {job.error}
                      </p>
                    )}
                    {job.status === "failed" && (
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void handleRetryJob(job.id)}
                          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    <div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                      <span>
                        Started:{" "}
                        {job.startedAt
                          ? new Date(job.startedAt).toLocaleString()
                          : "—"}
                      </span>
                      <span>
                        Updated:{" "}
                        {job.updatedAt
                          ? new Date(job.updatedAt).toLocaleString()
                          : "—"}
                      </span>
                      <span>
                        Completed:{" "}
                        {job.completedAt
                          ? new Date(job.completedAt).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="py-8 text-center text-xs text-slate-600">
          Automation Dashboard
        </footer>
      </div>
    </main>
  );
}
