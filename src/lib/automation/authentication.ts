import type { Page } from "playwright";

export type AuthenticationResult =
  | {
      status: "success";
    }
  | {
      status: "failed" | "manual-verification-required";
      message: string;
      retryable?: boolean;
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

async function waitForVisible(
  page: Page,
  selector: string,
  timeout = 5_000,
) {
  const locator = page.locator(selector).first();

  await locator.waitFor({
    state: "visible",
    timeout,
  });

  return locator;
}

async function waitForGoogleAuthentication(
  page: Page,
  onManualVerification: () => void,
): Promise<AuthenticationResult> {
  const deadline = Date.now() + 5 * 60_000;
  let manualVerificationReported = false;

  while (Date.now() < deadline) {
    const currentUrl = page.url();
    const bodyText = (
      await page.locator("body").innerText().catch(() => "")
    ).toLowerCase();

    if (
      /incorrect password|wrong password|couldn't find your google account|could not find your google account/.test(
        bodyText,
      )
    ) {
      return {
        status: "failed",
        message: "Authentication failed.",
      };
    }

    const manualVerificationRequired =
      /2-step verification|two-step verification|verification code|confirm it's you|use your phone|security key|passkey|captcha|recaptcha/.test(
        bodyText,
      );

    if (manualVerificationRequired && !manualVerificationReported) {
      manualVerificationReported = true;
      onManualVerification();
    }

    if (
      !currentUrl.includes("accounts.google.com") &&
      !(await page.locator('input[type="password"]').isVisible().catch(() => false))
    ) {
      return {
        status: "success",
      };
    }

    await page.waitForTimeout(1_000);
  }

  return manualVerificationReported
    ? {
        status: "manual-verification-required",
        message:
          "Manual verification was not completed before the authentication wait expired.",
      }
    : {
        status: "failed",
        message: "Authentication timed out.",
      };
}

export async function runAuthentication(
  page: Page,
  email: string,
  password: string,
  onManualVerification?: () => void,
): Promise<AuthenticationResult> {
  const existingEmailInput = await firstVisible(
    page,
    '#identifierId, input[type="email"], input[autocomplete="username"], input[name*="email" i], input[name*="user" i]',
  );

  if (!existingEmailInput) {
    const directSignIn = page.locator(
      'a[href*="accounts.google.com"]',
    ).first();
    const textSignIn = page
      .getByRole("link", { name: /sign in/i })
      .first();
    const signIn = (await directSignIn.isVisible().catch(() => false))
      ? directSignIn
      : textSignIn;

    if (!(await signIn.isVisible().catch(() => false))) {
      if (page.url().includes("google.com/maps")) {
        const continueUrl = encodeURIComponent(page.url());

        await page.goto(
          `https://accounts.google.com/ServiceLogin?continue=${continueUrl}`,
          {
            waitUntil: "domcontentloaded",
            timeout: 15_000,
          },
        );
      } else {
        return {
          status: "failed",
          message: "Sign-in control was not found on the target page.",
        };
      }
    }

    if (await signIn.isVisible().catch(() => false)) {
      await signIn.click();
    }

    await page.waitForURL(
      (url) => url.hostname === "accounts.google.com",
      { timeout: 5_000 },
    ).catch(() => undefined);
  }

  if (!password.trim()) {
    return {
      status: "failed",
      message: "Authentication password was not provided.",
    };
  }

  const emailInput = await waitForVisible(
    page,
    '#identifierId, input[type="email"], input[autocomplete="username"]',
  );

  await emailInput.fill(email);

  const emailNext = await firstVisible(
    page,
    '#identifierNext, button:has-text("Next"), button[type="submit"]',
  );

  if (!emailNext) {
    return {
      status: "failed",
      message: "Google email continuation control was not found.",
    };
  }

  await emailNext.click();

  await page.waitForTimeout(250);

  const postEmailText = (
    await page.locator("body").innerText().catch(() => "")
  ).toLowerCase();

  if (
    /couldn['’]t sign you in|could not sign you in|can['’]t sign you in|this browser or app may not be secure|couldn['’]t find your google account/.test(
      postEmailText,
    )
  ) {
    return {
      status: "failed",
      message:
        "Google rejected the sign-in attempt before the password step. Check the account, Google security prompts, or browser access requirements.",
      retryable: false,
    };
  }

  let passwordInput: Awaited<ReturnType<typeof firstVisible>>;

  try {
    passwordInput = await waitForVisible(
      page,
      'input[type="password"]',
      15_000,
    );
  } catch {
    const currentText = (
      await page.locator("body").innerText().catch(() => "")
    ).toLowerCase();

    if (
      /couldn['’]t sign you in|could not sign you in|can['’]t sign you in|this browser or app may not be secure/.test(
        currentText,
      )
    ) {
      return {
        status: "failed",
        message:
          "Google rejected the sign-in attempt before the password step.",
        retryable: false,
      };
    }

    return {
      status: "failed",
      message: "Google password field was not found.",
    };
  }

  await passwordInput.fill(password);

  const loginButton = await firstVisible(
    page,
    '#passwordNext, button:has-text("Next"), button[type="submit"]',
  );

  if (!loginButton) {
    return {
      status: "failed",
      message: "Authentication submit control was not found.",
    };
  }

  await loginButton.click();

  return waitForGoogleAuthentication(
    page,
    () => onManualVerification?.(),
  );
}