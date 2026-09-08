import type { Page } from "playwright";
import type { Account } from "@/types/automation";

export async function runPostAuthenticationStage(
  page: Page,
  account: Account
): Promise<void> {
  console.log(
    `Post-authentication stage started for: ${account.email}`
  );

  const heading = page.locator("h1");

  await heading.waitFor();

  const text = await heading.textContent();

  console.log(
    `Account ${account.email} found heading: ${text}`
  );

  console.log(
    `Post-authentication stage completed for: ${account.email}`
  );
}