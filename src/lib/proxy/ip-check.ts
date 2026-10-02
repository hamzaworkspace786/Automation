import type { BrowserContext } from "playwright";
import { compareObservedIp } from "./proxy-binding";

export type IpCheckResult = {
  ip: string | null;
  country?: string;
  city?: string;
  previousIp?: string;
  /** True when we had a previous IP on record and it differs from this one. */
  changed: boolean;
  /** True when the exit country differs from the country bound to the account. */
  countryMismatch: boolean;
};

/**
 * Looks up the public IP the *browser* is using (not Node), by loading a JSON
 * endpoint in a throwaway page of the proxied context.
 * Does not write to the binding; the caller decides whether to accept the IP.
 */
export async function checkProxyIp(
  context: BrowserContext,
  email: string,
  expectedCountry?: string,
): Promise<IpCheckResult> {
  let ip: string | null = null;
  let country: string | undefined;
  let city: string | undefined;

  const page = await context.newPage();
  try {
    await page.goto("https://ipinfo.io/json", {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    const body = await page.locator("body").innerText({ timeout: 5_000 });
    const data = JSON.parse(body) as {
      ip?: string;
      country?: string;
      city?: string;
    };
    ip = typeof data.ip === "string" ? data.ip : null;
    country = data.country;
    city = data.city;
  } catch {
    // Lookup failed (timeout, proxy hiccup, rate limit). Caller decides what to do.
  } finally {
    await page.close().catch(() => undefined);
  }

  if (!ip) {
    return { ip: null, changed: false, countryMismatch: false };
  }

  const { previousIp, changed } = compareObservedIp(email, ip);
  const countryMismatch = Boolean(
    expectedCountry &&
      country &&
      country.toLowerCase() !== expectedCountry.toLowerCase(),
  );

  return { ip, country, city, previousIp, changed, countryMismatch };
}
