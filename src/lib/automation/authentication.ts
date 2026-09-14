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

export async function runAuthentication(
  page: Page,
  email: string,
  password: string,
  onManualVerification?: () => void,
): Promise<AuthenticationResult> {
  console.log(`Starting login process for ${email}...`);

  // 1. Navigate to Google Sign In if not already there
  try {
    if (!page.url().includes("accounts.google.com")) {
      await page.goto("https://accounts.google.com/ServiceLogin", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }
  } catch (error) {
    console.log("Navigation warning, continuing to wait...", error);
  }

  // 2. Pre-fill email if the field is present and empty
  try {
    const emailInput = page.locator('#identifierId, input[type="email"]').first();
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      const val = await emailInput.inputValue().catch(() => "");
      if (!val && email) {
        await emailInput.fill(email);
        const nextBtn = page.locator('#identifierNext, button:has-text("Next")').first();
        if (await nextBtn.isVisible().catch(() => false)) {
          await nextBtn.click().catch(() => undefined);
        }
      }
    }
  } catch {
    // Ignore auto-fill errors so you can type manually if needed
  }

  // Notify UI/Logs that manual input is ready
  onManualVerification?.();
  console.log("Waiting up to 10 minutes for manual login completion...");

  // 3. Hands-off waiting loop: Holds browser open until Google finishes logging in
  const startTime = Date.now();
  const maxWaitMs = 10 * 60 * 1000; // 10 minutes

  while (Date.now() - startTime < maxWaitMs) {
    if (page.isClosed()) {
      return {
        status: "failed",
        message: "Browser window was closed manually before login finished.",
      };
    }

    const currentUrl = page.url();

    // Check if Google has redirected away from sign-in/login pages
    const isStillOnSignInPage =
      currentUrl.includes("accounts.google.com/v3/signin") ||
      currentUrl.includes("accounts.google.com/ServiceLogin") ||
      currentUrl.includes("accounts.google.com/signin") ||
      currentUrl.includes("accounts.google.com/InteractiveLogin") ||
      currentUrl.includes("accounts.google.com/v3/challenge");

    if (!isStillOnSignInPage) {
      // Confirm password field is no longer present on screen
      const hasPasswordInput = await page
        .locator('input[type="password"]')
        .isVisible()
        .catch(() => false);

      if (!hasPasswordInput) {
        console.log("Login detected successfully! Proceeding to target workflow...");
        return { status: "success" };
      }
    }

    // Check status every 1.5 seconds
    await page.waitForTimeout(1500);
  }

  return {
    status: "failed",
    message: "Manual login timed out after 10 minutes.",
  };
}