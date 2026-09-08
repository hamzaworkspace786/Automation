import type { Page } from "playwright";
import type { Account } from "@/types/automation";

export type AuthenticationStatus =
  | "authenticated"
  | "authentication_required";

export async function runAuthenticationStage(
  page: Page,
  account: Account
): Promise<AuthenticationStatus> {
  console.log(
    `Checking authentication for: ${account.email}`
  );

  const currentUrl = page.url();

  console.log(
    `Current page for ${account.email}: ${currentUrl}`
  );

  /*
   * For now, we use the current page as the test signal.
   *
   * Later, this function can be connected to the legitimate
   * authentication flow for your authorized test environment.
   */

  if (currentUrl.includes("accounts.google.com")) {
    console.log(
      `Authentication required for: ${account.email}`
    );

    return "authentication_required";
  }

  console.log(
    `Authentication appears complete for: ${account.email}`
  );

  return "authenticated";
}