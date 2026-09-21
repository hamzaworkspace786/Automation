import { Page, Frame } from 'playwright';

export async function runPostAuthentication(
  page: Page,
  targetUrl: string,
  categoryIndex: number = 0
) {
  try {
    // 1. Handle Google Sign-In redirect if needed
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

    // 3. Locate and click three-dots menu
    const threeDotsMenu = page.locator(
      'button[aria-label*="review" i], button[aria-label*="action" i], button[aria-label*="option" i], button[aria-label*="more" i], button[aria-label*="továbbiak" i], button[aria-label*="daugiau" i], button[aria-label*="más" i], button[aria-label*="mais" i], button[aria-label*="เพิ่มเติม"], button[aria-label*="meer" i], button[aria-label*="mer" i]'
    ).first();

    await threeDotsMenu.waitFor({ state: 'visible', timeout: 30000 });
    await threeDotsMenu.click();

    // 4. Click "Report review"
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
      await activePage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => { });
      await activePage.waitForTimeout(3000);
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

    // 6. Helper: Retrieve page and all iframe contexts
    const getExecutionTargets = (): (Page | Frame)[] => {
      return [activePage, ...activePage.frames()];
    };

    // 7. Wait for Report Options Container
    console.log('Waiting for report options container to render...');
    await activePage.waitForTimeout(2000);

    let activeTarget: Page | Frame = activePage;
    let optionSelected = false;

    // Direct Radio / Option Selectors
    const directSelectors = [
      '[role="radiogroup"] [role="radio"]',
      '[role="dialog"] [role="radio"]',
      'main [role="radio"]',
      '[role="radio"]',
      '[role="radiogroup"] label',
      '[role="dialog"] label'
    ];

    for (const selector of directSelectors) {
      if (optionSelected) break;

      for (const target of getExecutionTargets()) {
        try {
          const locator = target.locator(selector);
          const count = await locator.count();

          if (count >= 3) {
            const targetIndex = categoryIndex % count;
            const targetElement = locator.nth(targetIndex);

            if (await targetElement.isVisible().catch(() => false)) {
              console.log(`Found ${count} options using selector "${selector}". Selecting item ${targetIndex + 1}...`);

              await targetElement.scrollIntoViewIfNeeded().catch(() => { });
              await activePage.waitForTimeout(300);

              const box = await targetElement.boundingBox();
              if (box && box.y > 150) { // Ensure it's below the header bar
                activeTarget = target;
                const clickX = box.x + box.width / 2;
                const clickY = box.y + box.height / 2;

                await activePage.mouse.click(clickX, clickY);
                await activePage.waitForTimeout(500);

                optionSelected = true;
                break;
              }
            }
          }
        } catch {
          // Continue loop
        }
      }
    }

    // Fallback: Scoped Evaluator filtering out Header elements (Y < 160) and Title strings
    if (!optionSelected) {
      console.log('Standard selectors missed. Scanning for option body text (excluding headers)...');

      const titleHeaderRegex = /report review|รายงานรีวิว|bejelentés|pranešti|denunciar|melden/i;

      for (const target of getExecutionTargets()) {
        const optionBoxes = await target.evaluate((headerPatternStr) => {
          const headerPattern = new RegExp(headerPatternStr, 'i');
          const container = document.querySelector('[role="radiogroup"], [role="dialog"], main, body');
          if (!container) return [];

          const elements = Array.from(container.querySelectorAll('div, label, li, span'))
            .filter((el) => {
              const htmlEl = el as HTMLElement;
              const rect = htmlEl.getBoundingClientRect();
              const text = (htmlEl.innerText || '').trim();

              // CRITICAL: Filter out header region (Y < 160) and header title strings
              const isBelowHeader = rect.top >= 160;
              const isVisible = rect.width > 120 && rect.height >= 20 && rect.height <= 100;
              const isNotTitleText = !headerPattern.test(text);
              const isValidTextLength = text.length >= 4 && text.length <= 80;

              return isBelowHeader && isVisible && isNotTitleText && isValidTextLength;
            });

          // Filter out parent containers holding child elements
          const distinctOptions: { x: number; y: number; text: string }[] = [];
          for (const el of elements) {
            const htmlEl = el as HTMLElement;
            const rect = htmlEl.getBoundingClientRect();
            if (!elements.some((other) => other !== el && el.contains(other))) {
              distinctOptions.push({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                text: (htmlEl.innerText || '').trim().split('\n')[0]
              });
            }
          }
          return distinctOptions;
        }, titleHeaderRegex.source).catch(() => []);

        if (optionBoxes.length >= 3) {
          const targetBox = optionBoxes[categoryIndex % optionBoxes.length];
          activeTarget = target;

          console.log(`Scoped Scanner found ${optionBoxes.length} options. Clicking option "${targetBox.text}" at (${Math.round(targetBox.x)}, ${Math.round(targetBox.y)})...`);

          await activePage.mouse.click(targetBox.x, targetBox.y);
          await activePage.waitForTimeout(800);
          optionSelected = true;
          break;
        }
      }
    }

    if (!optionSelected) {
      throw new Error('Failed to locate or click a valid report category option.');
    }

    // 8. Locate and Click Submit / Next / Send Button
    console.log('Looking for active Submit / Next action button...');
    const submitRegex = /submit|report|next|continue|done|send|küldés|elküld|pateikti|siųsti|enviar|denunciar|ส่ง|ถัดไป|verzenden|melden|skicka|rapportera|tovább|siguiente/i;
    let submitClicked = false;

    // Search for visible enabled buttons near the lower part of the screen
    const buttonSelectors = [
      'button:not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
      'button',
      '[role="button"]'
    ];

    for (const selector of buttonSelectors) {
      if (submitClicked) break;

      try {
        const buttons = activeTarget.locator(selector);
        const count = await buttons.count();

        for (let i = 0; i < count; i++) {
          const btn = buttons.nth(i);
          const text = (await btn.innerText().catch(() => '')) || (await btn.getAttribute('aria-label').catch(() => '')) || '';

          if (submitRegex.test(text) && await btn.isVisible().catch(() => false)) {
            console.log(`Clicking Submit button: "${text.trim()}"`);
            const box = await btn.boundingBox();
            if (box) {
              await activePage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            } else {
              await btn.click({ force: true });
            }
            submitClicked = true;
            break;
          }
        }
      } catch {
        // Continue loop
      }
    }

    if (!submitClicked) {
      console.log('Text-matched submit button not found. Clicking primary action button in footer...');
      const primaryBtn = activeTarget.locator('[role="dialog"] button, main button, form button').last();
      if (await primaryBtn.isVisible().catch(() => false)) {
        await primaryBtn.click({ force: true });
        submitClicked = true;
      }
    }

    // 9. Verify Google's Confirmation Screen ("Thanks for reporting")
    console.log('Verifying submission confirmation from Google...');
    const confirmationRegex = /thanks|thank you|submitted|received|report received|köszönjük|pateikta|enviado|บันทึกแล้ว|ขอบคุณ|ontvangen|tack|close|done|kész/i;

    let isConfirmed = false;

    for (let check = 0; check < 12; check++) {
      for (const target of getExecutionTargets()) {
        const pageText = await target.evaluate(() => document.body.innerText).catch(() => '');
        if (confirmationRegex.test(pageText)) {
          isConfirmed = true;
          break;
        }
      }
      if (isConfirmed) break;
      await activePage.waitForTimeout(1000);
    }

    if (!isConfirmed) {
      throw new Error('Submit was clicked, but Google confirmation screen ("Thanks for reporting") was not detected.');
    }

    console.log(`Successfully reported review and verified Google confirmation screen for category index ${categoryIndex}`);

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