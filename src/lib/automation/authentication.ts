import type { Page } from "playwright";

export type AuthenticationResult =
  | {
      status: "success";
    }
  | {
      status: "failed" | "manual-verification-required";
      message: string;
    };

async function firstVisible(
  page: Page,
  selector: string,
): Promise<ReturnType<Page["locator"]> | undefined> {
  const candidates = page.locator(selector);

  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);

    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }

  return undefined;
}

export async function runAuthentication(
  page: Page,
  email: string,
  password: string,
): Promise<AuthenticationResult> {
  const emailInput = await firstVisible(
    page,
    'input[type="email"], input[autocomplete="username"], input[name*="email" i], input[name*="user" i]',
  );

  if (!emailInput) {
    return {
      status: "failed",
      message: "Authentication email field was not found.",
    };
  }

  if (!password.trim()) {
    return {
      status: "failed",
      message: "Authentication password was not provided.",
    };
  }

  await emailInput.fill(email);

  const passwordInput = await firstVisible(
    page,
    'input[type="password"]',
  );

  if (!passwordInput) {
    return {
      status: "failed",
      message: "Authentication password field was not found.",
    };
  }

  await passwordInput.fill(password);

  const loginButton = await firstVisible(
    page,
    'button[type="submit"], input[type="submit"], button',
  );

  if (!loginButton) {
    return {
      status: "failed",
      message: "Authentication submit control was not found.",
    };
  }

  await loginButton.click();

  await page.waitForLoadState("domcontentloaded", {
    timeout: 15_000,
  }).catch(() => undefined);

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const normalizedText = bodyText.toLowerCase();

  if (
    /captcha|recaptcha|two-factor|multi-factor|verification code|verify you are human|security check|passkey/.test(
      normalizedText,
    )
  ) {
    return {
      status: "manual-verification-required",
      message: "Manual verification is required to complete authentication.",
    };
  }

  const errorText = normalizedText.match(
    /incorrect password|invalid password|invalid credentials|unable to sign in|sign in failed|login failed/,
  );

  if (errorText) {
    return {
      status: "failed",
      message: "Authentication failed.",
    };
  }

  if (await passwordInput.isVisible().catch(() => false)) {
    return {
      status: "failed",
      message: "Authentication result could not be confirmed.",
    };
  }

  return {
    status: "success",
  };
}