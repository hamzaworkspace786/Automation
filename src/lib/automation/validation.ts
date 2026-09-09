import type { Account, AutomationMode } from "@/types/automation";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function sanitizeErrorMessage(value: unknown): string {
  const base =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : "Unknown automation error";

  return base
    .replace(/password\s*[:=]\s*[^\s,;]+/gi, "password=[REDACTED]")
    .replace(/(?<=\bpassword\b\s*[:=]\s*)(?:[^\s,;]+)/gi, "[REDACTED]")
    .replace(/(?<=\bsecret\b\s*[:=]\s*)(?:[^\s,;]+)/gi, "[REDACTED]")
    .replace(/(?<=\btoken\b\s*[:=]\s*)(?:[^\s,;]+)/gi, "[REDACTED]");
}

export function parseAccountsInput(raw: string): {
  accounts: Account[];
  errors: string[];
} {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const errors: string[] = [];
  const seenEmails = new Set<string>();
  const accounts: Account[] = [];

  if (lines.length === 0) {
    return {
      accounts,
      errors: ["Enter at least one account in email,password format."],
    };
  }

  lines.forEach((line, index) => {
    const [emailValue, ...rest] = line.split(",");
    const email = emailValue?.trim() ?? "";
    const password = rest.join(",").trim();

    if (!email && !password) {
      return;
    }

    if (!email || !EMAIL_PATTERN.test(email)) {
      errors.push(`Line ${index + 1}: invalid email address.`);
      return;
    }

    if (!password) {
      errors.push(`Line ${index + 1}: password is missing.`);
      return;
    }

    const normalizedEmail = email.toLowerCase();

    if (seenEmails.has(normalizedEmail)) {
      errors.push(`Line ${index + 1}: duplicate account for ${email}.`);
      return;
    }

    seenEmails.add(normalizedEmail);
    accounts.push({
      email,
      password,
    });
  });

  return {
    accounts,
    errors,
  };
}

export function validateAccountList(
  accounts: Account[],
  mode: AutomationMode = "authenticate",
): string[] {
  const errors: string[] = [];

  if (!Array.isArray(accounts) || accounts.length === 0) {
    return ["At least one account is required."];
  }

  const seen = new Set<string>();

  accounts.forEach((account, index) => {
    const email = account?.email?.trim() ?? "";
    const password = account?.password?.trim() ?? "";

    if (!email || !EMAIL_PATTERN.test(email)) {
      errors.push(`Account ${index + 1}: invalid email address.`);
    }

    if (mode === "authenticate" && !password) {
      errors.push(`Account ${index + 1}: password is required.`);
    }

    const normalized = email.toLowerCase();

    if (normalized && seen.has(normalized)) {
      errors.push(`Account ${index + 1}: duplicate email ${email}.`);
    }

    if (normalized) {
      seen.add(normalized);
    }
  });

  return errors;
}
