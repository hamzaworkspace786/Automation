import fs from "node:fs";
import path from "node:path";
import type { BrowserContext } from "playwright";
import { getSessionFilePath } from "./session-state";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
type Cookie = StorageState["cookies"][number];

/** Hard cap per account session file. Override with SESSION_MAX_BYTES. */
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Cookie domains that are needed to stay signed in to Google.
 * The target site's host is added automatically. Extend with
 * SESSION_EXTRA_DOMAINS="example.com,other.com" if needed.
 */
const BASE_DOMAINS = ["google.com", "youtube.com"];

export type SaveSessionResult = {
  bytes: number;
  cookies: number;
  trimmed: boolean;
};

function maxBytes(): number {
  const parsed = Number.parseInt(process.env.SESSION_MAX_BYTES ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

function allowedDomains(targetUrl?: string): string[] {
  const domains = [...BASE_DOMAINS];

  for (const extra of (process.env.SESSION_EXTRA_DOMAINS ?? "").split(",")) {
    const d = extra.trim().toLowerCase();
    if (d) domains.push(d);
  }

  if (targetUrl) {
    try {
      domains.push(new URL(targetUrl).hostname.toLowerCase());
    } catch {
      // ignore bad URL
    }
  }

  return domains;
}

function domainAllowed(cookieDomain: string, allowed: string[]): boolean {
  const d = cookieDomain.replace(/^\./, "").toLowerCase();
  return allowed.some(
    (a) =>
      d === a ||
      d.endsWith(`.${a}`) ||
      // cookie set on a parent domain of the target host (e.g. .mysite.com for app.mysite.com)
      (d.includes(".") && a.endsWith(`.${d}`)),
  );
}

function trimState(state: StorageState, targetUrl?: string): StorageState {
  const allowed = allowedDomains(targetUrl);
  const now = Date.now() / 1000;

  const cookies = state.cookies.filter(
    (c: Cookie) =>
      domainAllowed(c.domain, allowed) && (c.expires === -1 || c.expires > now),
  );

  // localStorage is only kept for the target site. Google's login lives in cookies.
  let targetHost: string | undefined;
  try {
    targetHost = targetUrl ? new URL(targetUrl).hostname.toLowerCase() : undefined;
  } catch {
    targetHost = undefined;
  }

  const origins = state.origins.filter((o) => {
    if (!targetHost) return false;
    try {
      return new URL(o.origin).hostname.toLowerCase() === targetHost;
    } catch {
      return false;
    }
  });

  return { cookies, origins };
}

function size(state: StorageState): number {
  return Buffer.byteLength(JSON.stringify(state), "utf8");
}

/** Last-resort shrinking if a state is still over the cap after filtering. */
function enforceCap(state: StorageState, cap: number): StorageState {
  if (size(state) <= cap) return state;

  // 1) drop all localStorage
  let next: StorageState = { cookies: state.cookies, origins: [] };
  if (size(next) <= cap) return next;

  // 2) drop the largest cookies until it fits
  const cookies = [...next.cookies].sort(
    (a, b) => b.value.length - a.value.length,
  );
  while (cookies.length > 0 && size({ cookies, origins: [] }) > cap) {
    cookies.shift();
  }
  next = { cookies, origins: [] };
  return next;
}

function atomicWrite(file: string, data: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function sessionFileExists(email: string): boolean {
  return fs.existsSync(getSessionFilePath(email));
}

export function loadStorageState(email: string): StorageState | undefined {
  try {
    const raw = fs.readFileSync(getSessionFilePath(email), "utf8");
    const parsed = JSON.parse(raw) as Partial<StorageState>;
    if (!Array.isArray(parsed.cookies)) return undefined;
    return {
      cookies: parsed.cookies,
      origins: Array.isArray(parsed.origins) ? parsed.origins : [],
    };
  } catch {
    return undefined;
  }
}

export function deleteSession(email: string): void {
  fs.rmSync(getSessionFilePath(email), { force: true });
}

/**
 * Snapshot the context's cookies/localStorage, strip everything non-essential,
 * enforce the size cap, and write it atomically.
 * Only call this once the session has been verified as logged in.
 */
export async function saveSession(
  context: BrowserContext,
  email: string,
  targetUrl?: string,
): Promise<SaveSessionResult> {
  const raw = await context.storageState();
  const rawBytes = size(raw);

  const trimmedState = enforceCap(trimState(raw, targetUrl), maxBytes());
  const json = JSON.stringify(trimmedState);

  atomicWrite(getSessionFilePath(email), json);

  return {
    bytes: Buffer.byteLength(json, "utf8"),
    cookies: trimmedState.cookies.length,
    trimmed: rawBytes > Buffer.byteLength(json, "utf8"),
  };
}
