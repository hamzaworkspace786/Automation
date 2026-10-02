import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getBindingFilePath, normalizeEmail } from "@/lib/browser/session-state";

/**
 * A binding permanently ties one account to one proxy "identity":
 * country, timezone, locale and the DataImpulse sessid.
 * Created once, then reused on every launch so the account always asks the
 * proxy for the same IP slot (and always presents the same geo fingerprint).
 */
export interface ProxyBinding {
  email: string;
  countryCode: string;
  timezoneId: string;
  locale: string;
  sessionId: string;
  /** Bump to deliberately move the account to a new IP slot. */
  generation: number;
  createdAt: string;
  lastKnownIp?: string;
  lastIpCheckAt?: string;
  ipChangeCount: number;
}

function atomicWrite(file: string, data: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function readBinding(email: string): ProxyBinding | null {
  try {
    const raw = fs.readFileSync(getBindingFilePath(email), "utf8");
    const parsed = JSON.parse(raw) as Partial<ProxyBinding>;
    if (
      !parsed.sessionId ||
      !parsed.countryCode ||
      !parsed.timezoneId ||
      !parsed.locale
    ) {
      return null;
    }
    return {
      email: normalizeEmail(email),
      countryCode: parsed.countryCode,
      timezoneId: parsed.timezoneId,
      locale: parsed.locale,
      sessionId: parsed.sessionId,
      generation: parsed.generation ?? 0,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      lastKnownIp: parsed.lastKnownIp,
      lastIpCheckAt: parsed.lastIpCheckAt,
      ipChangeCount: parsed.ipChangeCount ?? 0,
    };
  } catch {
    return null;
  }
}

export function writeBinding(binding: ProxyBinding): void {
  atomicWrite(
    getBindingFilePath(binding.email),
    JSON.stringify(binding, null, 2),
  );
}

export function updateBinding(
  email: string,
  patch: Partial<ProxyBinding>,
): ProxyBinding | null {
  const current = readBinding(email);
  if (!current) return null;
  const next = { ...current, ...patch, email: current.email };
  writeBinding(next);
  return next;
}

/**
 * Compare an observed IP with the last one we saw for this account.
 * Does NOT write anything; call acceptObservedIp() to commit it.
 */
export function compareObservedIp(
  email: string,
  ip: string,
): { previousIp?: string; changed: boolean } {
  const binding = readBinding(email);
  const previousIp = binding?.lastKnownIp;
  return { previousIp, changed: Boolean(previousIp && previousIp !== ip) };
}

export function acceptObservedIp(email: string, ip: string): void {
  const binding = readBinding(email);
  if (!binding) return;
  const changed = Boolean(binding.lastKnownIp && binding.lastKnownIp !== ip);
  writeBinding({
    ...binding,
    lastKnownIp: ip,
    lastIpCheckAt: new Date().toISOString(),
    ipChangeCount: binding.ipChangeCount + (changed ? 1 : 0),
  });
}

/** Deliberately move an account to a fresh IP slot (new sessid, same country). */
export function rotateBindingSession(email: string): ProxyBinding | null {
  const binding = readBinding(email);
  if (!binding) return null;
  const generation = binding.generation + 1;
  const next: ProxyBinding = {
    ...binding,
    generation,
    sessionId: buildSessionId(email, generation),
    lastKnownIp: undefined,
    lastIpCheckAt: undefined,
  };
  writeBinding(next);
  return next;
}

/** Deterministic, URL-safe sessid. Never contains the raw email. */
export function buildSessionId(email: string, generation: number): string {
  const hash = createHash("sha256")
    .update(normalizeEmail(email))
    .digest("hex")
    .slice(0, 12);
  return `acc${hash}g${generation}`;
}
