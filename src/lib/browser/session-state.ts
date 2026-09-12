import { access } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PROFILES_DIR = path.join(process.cwd(), "profiles");

export function getAccountProfileDir(email: string): string {
  const baseDir = process.env.AUTOMATION_PROFILES_DIR ?? DEFAULT_PROFILES_DIR;
  return path.join(baseDir, encodeURIComponent(email.trim().toLowerCase()));
}

export async function hasExistingProfile(email: string): Promise<boolean> {
  try {
    const dirPath = getAccountProfileDir(email);
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

export function isGoogleSignInUrl(url: string): boolean {
  return /(^|\.)accounts\.google\.com$/i.test(new URL(url).hostname);
}