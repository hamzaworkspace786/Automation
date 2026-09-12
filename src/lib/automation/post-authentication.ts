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
    const categoryOption = activePage.getByText(/Bullying or harassment/i)
      .or(activePage.locator(':text-matches("Bullying", "i")'))
      .first();

    await categoryOption.waitFor({ state: 'visible', timeout: 20000 });
    await categoryOption.click();

    // Wait 1.5 seconds for Google's UI animation to slide to the next screen
    // and for the Submit button to become fully interactive.
    await activePage.waitForTimeout(1500);

    // 6. Click the Submit / Report button on the final screen
    // Stronger locator to ensure it only grabs the exact Submit button on the active pane
    const submitButton = activePage.getByRole('button', { name: /submit|report/i })
      .or(activePage.locator('button:has-text("Submit"), button:has-text("Report")'))
      .last();

    await submitButton.waitFor({ state: 'visible', timeout: 15000 });

    // Remove force: true so Playwright verifies the button is actually clickable
    await submitButton.click();

    // Wait 4 seconds for the network request to actually submit to Google's servers before closing
    await activePage.waitForTimeout(4000);
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