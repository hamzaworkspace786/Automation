import { chromium } from "playwright";

export type BrowserJobAccount = {
  email: string;
  password: string;
};

export type BrowserJobResult = {
  success: boolean;
  email: string;
  stage: string;
  message: string;
};

export async function runBrowserWorkflow(
  targetUrl: string,
  account: BrowserJobAccount,
): Promise<BrowserJobResult> {
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext();

    const page = await context.newPage();

    // Stage 1: Open target
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Stage 2: Locate email field
    const emailInput = page.getByTestId("email-input");

    await emailInput.waitFor({
      state: "visible",
      timeout: 10_000,
    });

    // Stage 3: Enter email
    await emailInput.fill(account.email);

    // Stage 4: Enter password
    const passwordInput = page.getByTestId("password-input");

    await passwordInput.waitFor({
      state: "visible",
      timeout: 10_000,
    });

    await passwordInput.fill(account.password);

    // Stage 5: Submit login
    const loginButton = page.getByTestId("login-button");

    await loginButton.waitFor({
      state: "visible",
      timeout: 10_000,
    });

    await loginButton.click();

    // Stage 6: Verify authentication
    const authenticatedUser =
      page.getByTestId("authenticated-user");

    await authenticatedUser.waitFor({
      state: "visible",
      timeout: 10_000,
    });

    // Stage 7: Verify authenticated account
    const authenticatedEmail =
      await authenticatedUser.textContent();

    if (!authenticatedEmail?.includes(account.email)) {
      throw new Error(
        "Authenticated account does not match the expected account.",
      );
    }

    // Stage 8: Perform post-authentication action
    const postAuthAction =
      page.getByTestId("post-auth-action");

    await postAuthAction.waitFor({
      state: "visible",
      timeout: 10_000,
    });

    await postAuthAction.click();

    // Stage 9: Verify workflow completion
    const actionSuccess =
      page.getByTestId("action-success");

    await actionSuccess.waitFor({
      state: "visible",
      timeout: 10_000,
    });

    return {
      success: true,
      email: account.email,
      stage: "completed",
      message: "Browser workflow completed successfully.",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown browser workflow error.";

    return {
      success: false,
      email: account.email,
      stage: "failed",
      message,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}