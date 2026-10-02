import path from "node:path";

/**
 * Everything persisted per account lives under one data directory:
 *
 *   <dataDir>/sessions/<email>.json   -> trimmed Playwright storage state (cookies etc.)
 *   <dataDir>/bindings/<email>.json   -> proxy binding (country, tz, locale, sessid, last IP)
 *
 * Both directories contain live credentials/identity data. Keep them out of git.
 */
export function getDataDir(): string {
  return (
    process.env.AUTOMATION_DATA_DIR ??
    path.join(process.cwd(), ".automation-data")
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function fileKey(email: string): string {
  return encodeURIComponent(normalizeEmail(email));
}

export function getSessionFilePath(email: string): string {
  return path.join(getDataDir(), "sessions", `${fileKey(email)}.json`);
}

export function getBindingFilePath(email: string): string {
  return path.join(getDataDir(), "bindings", `${fileKey(email)}.json`);
}

export function isGoogleSignInUrl(url: string): boolean {
  try {
    return /(^|\.)accounts\.google\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
