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

    // 4. Click the "Report review" option
    const reportReviewButton = page.getByRole('menuitem', { name: /report review/i })
      .or(page.locator('text="Report review"'))
      .first();

    await reportReviewButton.waitFor({ state: 'visible', timeout: 10000 });

    // Start listening for a new tab BEFORE clicking
    const newPagePromise = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);

    await reportReviewButton.click({ force: true });

    // Check if a new tab opened, otherwise fall back to the original page
    const newTab = await newPagePromise;
    const activePage = newTab || page;

    if (newTab) {
      console.log('Detected new tab for reporting flow.');
      // Wait for the page's background scripts to finish loading the options
      await activePage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });
      await activePage.waitForTimeout(2000); // Safety buffer for React/Angular hydration
    }

    // 5. Select a high-priority reporting category on the correct tab
    // Aggressive Regex locator to pierce through Google's nested HTML tags
    const categoryOption = activePage.getByText(/Bullying or harassment/i)
      .or(activePage.locator(':text-matches("Bullying", "i")'))
      .first();

    await categoryOption.waitFor({ state: 'visible', timeout: 20000 });
    await categoryOption.click({ force: true });

    // 6. Click the Submit / Report button on the final screen
    const submitButton = activePage.locator('button:has-text("Submit"), button:has-text("Report")').last();
    await submitButton.waitFor({ state: 'visible', timeout: 15000 });
    await submitButton.click({ force: true });

    // Wait a brief moment for the submission network request to clear
    await activePage.waitForTimeout(3000);
    console.log('Successfully reported the review.');

  } catch (error) {
    console.error('Failed during post-authentication steps:', error);

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