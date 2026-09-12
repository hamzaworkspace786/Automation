import { Page } from 'playwright';

export async function runPostAuthentication(page: Page, targetUrl: string) {
  try {
    // 1. Wait for login redirect to finish
    await page.waitForURL((url) => !url.href.includes('accounts.google.com/signin'), {
      timeout: 30000,
      waitUntil: 'domcontentloaded'
    });

    // 2. Navigate directly to your Google Maps review link
    console.log(`Navigating to target URL: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 3. Locate and click the three-dots menu next to the review
    const threeDotsMenu = page.locator(
      'button[aria-label="More review actions"], button[aria-label="Action menu"], button[aria-label*="action" i], button[aria-label*="option" i]'
    ).first();

    await threeDotsMenu.waitFor({ state: 'visible', timeout: 30000 });
    await threeDotsMenu.click();

    // 4. Click the "Report review" option from the dropdown
    // Using { force: true } to bypass invisible Google tracking overlays
    const reportReviewButton = page.getByRole('menuitem', { name: /report review/i })
      .or(page.locator('text="Report review"'))
      .first();

    await reportReviewButton.waitFor({ state: 'visible', timeout: 10000 });
    await reportReviewButton.click({ force: true });

    // 5. Wait for the reporting modal, then select the first category
    // Using { force: true } to ensure click registers on the radio button
    const firstCategoryRadio = page.getByRole('radio').first();
    await firstCategoryRadio.waitFor({ state: 'visible', timeout: 15000 });
    await firstCategoryRadio.click({ force: true });

    // 6. Click the Submit / Report button to finalize
    // Using { force: true } to ensure the final submission works
    const submitButton = page.locator('button:has-text("Submit"), button:has-text("Report")').last();
    await submitButton.waitFor({ state: 'visible', timeout: 10000 });
    await submitButton.click({ force: true });

    // Wait a brief moment for the submission network request to clear
    await page.waitForTimeout(3000);
    console.log('Successfully reported the review.');

  } catch (error) {
    console.error('Failed during post-authentication steps:', error);

    // Safely capture a screenshot of the failure state
    if (!page.isClosed()) {
      try {
        await page.screenshot({ path: `failure-debug-${Date.now()}.png` });
      } catch (screenshotError) {
        console.error('Could not save screenshot:', screenshotError);
      }
    }

    throw error;
  }
}