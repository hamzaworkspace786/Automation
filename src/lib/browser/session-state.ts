import { access } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SESSION_DIRECTORY = path.join(process.cwd(), "states");

export function getSessionStatePath(email: string): string {
  const directory = path.resolve(
    /* turbopackIgnore: true */
    process.env.AUTOMATION_SESSION_DIR ?? DEFAULT_SESSION_DIRECTORY,
  );
  const fileName = `${encodeURIComponent(email.trim().toLowerCase())}.json`;

  return path.join(directory, fileName);
}

export function isGoogleSignInUrl(url: string): boolean {
  return /(^|\.)accounts\.google\.com$/i.test(
    new URL(url).hostname,
  );
}

export async function assertSessionStateExists(
  email: string,
): Promise<string> {
  const statePath = getSessionStatePath(email);

  try {
    await access(statePath);
  } catch {
    throw new Error(
      `Session state file is missing for account ${email}.`,
    );
  }

  return statePath;
}