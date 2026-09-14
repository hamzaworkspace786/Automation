import { Page } from 'playwright';

export async function runPostAuthentication(page: Page, targetUrl: string) {
  try {
    // 1. Wait for login redirect to finish if currently on a sign-in page
    if (page.url().includes('accounts.google.com')) {
      console.log('Detected Google Sign-In page. Waiting up to 3 minutes for manual login...');
      await page.waitForURL((url) => !url.href.includes('accounts.google.com/signin'), {
        timeout: 180000,
        waitUntil: 'domcontentloaded'
      });
    }

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
      await activePage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });
      await activePage.waitForTimeout(2000);
    }

    // CHECKPOINT: If Google demands a sign-in inside the new reporting tab, pause and wait for you to log in
    const isSignInTab = activePage.url().includes('accounts.google.com') ||
      await activePage.locator('input[type="email"], input[type="password"]').isVisible().catch(() => false);

    if (isSignInTab) {
      console.log('Google requested sign-in on the report window. Waiting up to 3 minutes for you to log in manually...');
      await activePage.waitForURL((url) => !url.href.includes('accounts.google.com'), {
        timeout: 180000,
        waitUntil: 'domcontentloaded'
      });
      await activePage.waitForTimeout(2000);
    }

    // 5. Select a high-priority reporting category on the correct tab
    const categoryOption = activePage.getByText(/Bullying or harassment/i)
      .or(activePage.locator(':text-matches("Bullying", "i")'))
      .first();

    await categoryOption.waitFor({ state: 'visible', timeout: 30000 });
    await categoryOption.click();

    // Wait 1.5 seconds for Google's UI animation to slide to the next screen
    await activePage.waitForTimeout(1500);

    // 6. Click the Submit / Report button on the final screen
    const submitButton = activePage.getByRole('button', { name: /submit|report/i })
      .or(activePage.locator('button:has-text("Submit"), button:has-text("Report")'))
      .last();

    await submitButton.waitFor({ state: 'visible', timeout: 15000 });
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