import type { Page } from "playwright";

export async function runPostAuthentication(
  page: Page,
): Promise<void> {
  const actionButton = page.getByTestId(
    "post-auth-action",
  );

  await actionButton.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  await actionButton.click();

  const successIndicator = page.getByTestId(
    "action-success",
  );

  await successIndicator.waitFor({
    state: "visible",
    timeout: 10_000,
  });
}