import { Page } from 'playwright';

export async function runPostAuthentication(page: Page, targetUrl: string) {
  try {
    // 1. If Google prompts for login, give up to 3 minutes for manual input
    if (page.url().includes('accounts.google.com')) {
      console.log('Detected Google Sign-In page. Waiting up to 3 minutes for manual login...');
      await page.waitForURL((url) => !url.href.includes('accounts.google.com/signin'), {
        timeout: 180000,
        waitUntil: 'domcontentloaded'
      });
    }

    // 2. Navigate to target URL
    console.log(`Navigating to target URL: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 3. Locate and click three-dots menu (Expanded to catch generic localized "More/Actions" attributes)
    const threeDotsMenu = page.locator(
      'button[aria-label*="review" i], button[aria-label*="action" i], button[aria-label*="option" i], button[aria-label*="more" i], button[aria-label*="továbbiak" i], button[aria-label*="daugiau" i], button[aria-label*="más" i], button[aria-label*="mais" i], button[aria-label*="เพิ่มเติม"], button[aria-label*="meer" i], button[aria-label*="mer" i]'
    ).first();

    await threeDotsMenu.waitFor({ state: 'visible', timeout: 30000 });
    await threeDotsMenu.click();

    // 4. Click "Report review" (Supports EN, HU, LT, ES, PT, TH, NL, SV)
    const reportMenuRegex = /report review|report|bejelentés|pranešti|denunciar|รายงาน|melden|rapportera/i;
    const reportReviewButton = page.getByRole('menuitem', { name: reportMenuRegex })
      .or(page.getByText(reportMenuRegex, { exact: false }))
      .first();

    await reportReviewButton.waitFor({ state: 'visible', timeout: 10000 });

    const newPagePromise = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await reportReviewButton.click({ force: true });

    const newTab = await newPagePromise;
    const activePage = newTab || page;

    if (newTab) {
      console.log('Detected new tab for reporting flow.');
      await activePage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });
      await activePage.waitForTimeout(2000);
    }

    // 5. Check if Google requests authentication inside reporting popup
    const isSignInTab = activePage.url().includes('accounts.google.com') ||
      await activePage.locator('input[type="email"], input[type="password"]').isVisible().catch(() => false);

    if (isSignInTab) {
      console.log('Google requested sign-in on the report window. Waiting up to 3 minutes for manual login...');
      await activePage.waitForURL((url) => !url.href.includes('accounts.google.com'), {
        timeout: 180000,
        waitUntil: 'domcontentloaded'
      });
      await activePage.waitForTimeout(2000);
    }

    // 6. Select category: Bullying or harassment (Supports EN, HU, LT, ES, PT, TH, NL, SV)
    const categoryRegex = /bullying|harassment|zaklatás|megfélemlítés|patyčios|priekabiavimas|acoso|intimidación|assédio|กลั่นแกล้ง|คุกคาม|pesten|intimidatie|mobbning|trakasserier/i;
    const categoryOption = activePage.getByText(categoryRegex)
      .or(activePage.locator(`:text-matches("${categoryRegex.source}", "i")`))
      .first();

    await categoryOption.waitFor({ state: 'visible', timeout: 30000 });
    await categoryOption.click();

    await activePage.waitForTimeout(1500);

    // 7. Click Submit / Report (Supports EN, HU, LT, ES, PT, TH, NL, SV)
    const submitRegex = /submit|report|küldés|elküld|pateikti|siųsti|enviar|denunciar|ส่ง|verzenden|melden|skicka|rapportera/i;
    const submitButton = activePage.getByRole('button', { name: submitRegex })
      .or(activePage.locator('button').filter({ hasText: submitRegex }))
      .last();

    await submitButton.waitFor({ state: 'visible', timeout: 15000 });
    await submitButton.click();

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