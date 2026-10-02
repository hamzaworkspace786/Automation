import type { BrowserContext } from "playwright";
import type { AutomationJob, AutomationMode, JobStage } from "@/types/automation";
import { runWorkflow } from "./workflow";
import { checkProxyIp } from "@/lib/proxy/ip-check";
import { acceptObservedIp } from "@/lib/proxy/proxy-binding";

export type JobStageCallback = (job: AutomationJob, stage: JobStage) => void;

export type JobRuntimeOptions = {
  /** True when this job's browser is routed through a proxy. */
  proxied?: boolean;
  /** Country the account is bound to (lowercase ISO code). */
  expectedCountry?: string;
  /** Called once the account is confirmed signed in (saves the session file). */
  onSessionValidated?: () => Promise<void>;
};

export async function runAutomationJob(
  job: AutomationJob,
  context: BrowserContext,
  targetUrl: string,
  mode: AutomationMode,
  onStage?: JobStageCallback,
  runtime: JobRuntimeOptions = {}
): Promise<AutomationJob> {
  // Verify the IP the browser actually exits from, and detect drift.
  if (runtime.proxied) {
    const email = job.account.email;
    const check = await checkProxyIp(context, email, runtime.expectedCountry);

    if (!check.ip) {
      console.warn(`[IP Check] ${email}: could not determine exit IP.`);
    } else {
      console.log(
        `[IP Verified] ${email} -> ${check.ip} (${check.city ?? "?"}, ${check.country ?? "?"})`
      );

      if (check.countryMismatch) {
        console.warn(
          `[IP Check] ${email}: exit country ${check.country} does not match bound country ${runtime.expectedCountry?.toUpperCase()}.`
        );
      }

      // PROXY_STRICT_IP=1 -> refuse to reuse a saved session from a different IP.
      // Run "authenticate" mode to re-validate the account and accept the new IP.
      const strict = process.env.PROXY_STRICT_IP === "1";

      if (check.changed && strict && mode === "reuse-session") {
        const message =
          `IP_CHANGED: ${email} was last seen on ${check.previousIp} but is now on ${check.ip}. ` +
          `Run in authenticate mode to re-validate and accept the new IP.`;
        console.warn(`[IP Check] ${message}`);
        onStage?.(job, "failed");

        return {
          ...job,
          status: "failed",
          stage: "failed",
          error: message,
          retryable: false,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
      }

      if (check.changed) {
        console.warn(
          `[IP Check] ${email}: IP changed ${check.previousIp} -> ${check.ip}.`
        );
      }

      acceptObservedIp(email, check.ip);
    }
  }

  const result = await runWorkflow(
    job.account,
    context,
    targetUrl,
    mode,
    (stage) => onStage?.(job, stage),
    job.categoryIndex ?? 0,
    { onSessionValidated: runtime.onSessionValidated }
  );

  if (result.success) {
    return {
      ...job,
      status: "success",
      stage: "completed",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  }

  return {
    ...job,
    status: "failed",
    stage: result.failureStage ?? "failed",
    error: result.message,
    retryable: result.retryable ?? false,
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}
