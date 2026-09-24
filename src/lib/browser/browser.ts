import { chromium, type BrowserContext } from "playwright";
import { getAccountProfileDir } from "./session-state";
import fs from "fs";
import path from "path";

export async function launchAccountContext(
  email: string,
  headless = false
): Promise<BrowserContext> {
  const profileDir = getAccountProfileDir(email);

  return chromium.launchPersistentContext(profileDir, {
    headless,
    channel: "chrome",
    viewport: { width: 1280, height: 720 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-service-autorun",
      "--disk-cache-size=1",
      "--media-cache-size=1",
      "--disable-gpu-shader-disk-cache",
      "--disable-crash-reporter",
      "--disable-logging",
      "--disable-dev-shm-usage",
    ],
  });
}

export function cleanProfileBloat(profilePath: string) {
  const junkDirs = [
    "Default/Cache",
    "Default/Code Cache",
    "Default/GPUCache",
    "Default/Service Worker/CacheStorage",
    "Default/Service Worker/ScriptCache",
    "Default/History",
    "Default/History Provider Cache",
    "GrShaderCache",
    "Crashpad",
    "ShaderCache",
    "BrowserMetrics",
  ];

  for (const dir of junkDirs) {
    const targetPath = path.join(profilePath, dir);
    try {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
    } catch (err) {
      // Ignore file-lock errors silently
    }
  }
}