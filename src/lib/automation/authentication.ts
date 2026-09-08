import type { Page } from "playwright";

export async function runAuthentication(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const emailInput = page.getByTestId("email-input");

  try {
    await emailInput.waitFor({
      state: "visible",
      timeout: 10_000,
    });
  } catch {
    throw new Error(
      `Authentication form was not found at ${page.url()}. ` +
        "Use the target site's login page or the included /test-site page.",
    );
  }

  if (!password.trim()) {
    throw new Error(
      `No password was provided for ${email}. ` +
        "Use one account per line in the format email,password.",
    );
  }

  await emailInput.fill(email);

  const passwordInput = page.getByTestId(
    "password-input",
  );

  await passwordInput.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  await passwordInput.fill(password);

  const loginButton = page.getByTestId(
    "login-button",
  );

  await loginButton.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  await loginButton.click();

  const authenticatedUser = page.getByTestId(
    "authenticated-user",
  );

  await authenticatedUser.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  const authenticatedEmail =
    await authenticatedUser.textContent();

  if (!authenticatedEmail?.includes(email)) {
    throw new Error(
      "Authenticated account does not match the expected account.",
    );
  }
}