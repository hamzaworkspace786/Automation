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
    const isSignInTab = !activePage.isClosed() && (
      activePage.url().includes('accounts.google.com') ||
      await activePage.locator('input[type="email"], input[type="password"]').isVisible().catch(() => false)
    );

    if (isSignInTab && !activePage.isClosed()) {
      console.log('Google requested sign-in on the report window. Waiting up to 3 minutes for manual login...');
      await activePage.waitForURL((url) => !url.href.includes('accounts.google.com'), {
        timeout: 180000,
        waitUntil: 'domcontentloaded'
      });
      await activePage.waitForTimeout(2000);
    }

    // Helper: Safely retrieve active page and frame execution contexts
    const getExecutionTargets = (): (Page | Frame)[] => {
      if (activePage.isClosed()) return [];
      return [activePage, ...activePage.frames()];
    };

    // 6. Wait for Report Options Container
    console.log('Waiting for report options container to render...');
    await activePage.waitForTimeout(2000);

    let activeTarget: Page | Frame = activePage;
    let optionSelected = false;

    // Fast Path: Check if "Already reported" screen is displayed immediately on load
    const alreadyReportedRegex = /already reported|previously reported|already submitted|คุณได้รายงาน|já denunciado|már bejelentve|jau pranešta/i;
    for (const target of getExecutionTargets()) {
      const bodyText = await target.evaluate(() => document.body.innerText).catch(() => '');
      if (alreadyReportedRegex.test(bodyText)) {
        console.log('Detected "Already reported" screen on initial load. Waiting 4 seconds for you to view, then marking as completed.');
        await new Promise((resolve) => setTimeout(resolve, 4000));
        return;
      }
    }

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
              if (box && box.y > 150) {
                activeTarget = target;
                const clickX = box.x + box.width / 2;
                const clickY = box.y + box.height / 2;

                await activePage.mouse.click(clickX, clickY);
                await activePage.waitForTimeout(1000); // Give UI time to enable Submit button

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

    // Fallback: Scoped Evaluator filtering out Header elements
    if (!optionSelected) {
      console.log('Standard selectors missed. Scanning for option body text (excluding headers)...');
      const titleHeaderRegex = /report review|รายงานรีวิว|bejelentés|pranešti|denunciar|melden/i;

      for (const target of getExecutionTargets()) {
        const optionBoxes = await target.evaluate((headerPatternStr) => {
          const headerPattern = new RegExp(headerPatternStr, 'i');
          const container = document.querySelector('[role="radiogroup"], [role="dialog"], main, body');
          if (!container) return [];

          const elements = Array.from(container.querySelectorAll('div, label, li, span')).filter((el) => {
            const htmlEl = el as HTMLElement;
            const rect = htmlEl.getBoundingClientRect();
            const text = (htmlEl.innerText || '').trim();

            const isBelowHeader = rect.top >= 160;
            const isVisible = rect.width > 120 && rect.height >= 20 && rect.height <= 100;
            const isNotTitleText = !headerPattern.test(text);
            const isValidTextLength = text.length >= 4 && text.length <= 80;

            return isBelowHeader && isVisible && isNotTitleText && isValidTextLength;
          });

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

          console.log(`Scoped Scanner found ${optionBoxes.length} options. Clicking option "${targetBox.text}"...`);

          await activePage.mouse.click(targetBox.x, targetBox.y);
          await activePage.waitForTimeout(1000); // Give UI time to enable Submit button
          optionSelected = true;
          break;
        }
      }
    }

    if (!optionSelected) {
      throw new Error('Failed to locate or click a valid report category option.');
    }

    // 7. & 8. Unified Submit and Verify Completion Loop
    console.log('Processing submission and verifying completion...');

    const submitRegex = /submit|report|next|continue|send|küldés|elküld|pateikti|siųsti|enviar|denunciar|ส่ง|ถัดไป|verzenden|melden|skicka|rapportera|tovább|siguiente/i;
    const fallbackRegex = /cancel|close|back|mégse|bezárás|atšaukti|uždaryti|cancelar|cerrar|ยกเลิก|ปิด|avbryt|annuleren/i;
    const completionRegex = /thanks|thank you|submitted|received|report received|already reported|previously reported|köszönjük|pateikta|enviado|บันทึกแล้ว|ขอบคุณ|คุณได้รายงาน|ontvangen|tack|เสร็จสิ้น|ตกลง/i;

    let isCompleted = false;
    let submitAttempts = 0;
    let lastSubmitTime = 0;

    const attemptSubmitClick = async (): Promise<boolean> => {
      const buttonSelectors = [
        'button:not([disabled]):not([aria-disabled="true"])',
        '[role="button"]:not([disabled]):not([aria-disabled="true"])'
      ];

      for (const target of getExecutionTargets()) {
        for (const selector of buttonSelectors) {
          try {
            const buttons = target.locator(selector);
            const count = await buttons.count();

            for (let i = 0; i < count; i++) {
              const btn = buttons.nth(i);
              const text = ((await btn.innerText().catch(() => '')) || (await btn.getAttribute('aria-label').catch(() => '')) || '').trim();

              if (submitRegex.test(text) && await btn.isVisible().catch(() => false)) {
                console.log(`Clicking Submit/Next button: "${text}"`);
                const box = await btn.boundingBox();
                if (box) {
                  await activePage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                } else {
                  await btn.click({ force: true });
                }
                return true;
              }
            }
          } catch { }
        }
      }

      for (const target of getExecutionTargets()) {
        try {
          const primaryBtn = target.locator('[role="dialog"] button:not([disabled]):not([aria-disabled="true"]), form button:not([disabled])').last();
          if (await primaryBtn.isVisible().catch(() => false)) {
            const text = ((await primaryBtn.innerText().catch(() => '')) || '').trim();
            if (text && !fallbackRegex.test(text)) {
              console.log(`Clicking fallback primary button: "${text}"`);
              await primaryBtn.click({ force: true });
              return true;
            }
          }
        } catch { }
      }

      return false;
    };

    for (let check = 0; check < 20; check++) {
      if (activePage.isClosed()) {
        console.log('Report popup window closed automatically. Treating as success.');
        isCompleted = true;
        break;
      }

      let successFound = false;
      for (const target of getExecutionTargets()) {
        try {
          const containers = target.locator('[role="dialog"], [role="alert"], [aria-live="polite"], .toast, snack-bar-container, main, [role="main"]');
          const count = await containers.count();
          for (let i = 0; i < count; i++) {
            const text = (await containers.nth(i).innerText().catch(() => '')).toLowerCase();
            if (completionRegex.test(text)) {
              successFound = true;
              break;
            }
          }

          if (!successFound && submitAttempts > 0) {
            const pageText = (await target.evaluate(() => document.body?.innerText || '').catch(() => '')).toLowerCase();
            if (completionRegex.test(pageText)) {
              successFound = true;
              break;
            }
          }
        } catch { }
        if (successFound) break;
      }

      if (successFound) {
        console.log('Detected explicit success message ("Thanks for reporting", etc.) on screen! Waiting 4 seconds for you to view result...');
        await new Promise((resolve) => setTimeout(resolve, 4000));

        for (const target of getExecutionTargets()) {
          try {
            const doneBtn = target.locator('[role="dialog"] button, [role="alert"] button, button').filter({ hasText: /^(done|close|ok|bezárás|uždaryti|cerrar|ปิด)$/i }).first();
            if (await doneBtn.isVisible().catch(() => false)) {
              await doneBtn.click({ force: true }).catch(() => { });
            }
          } catch { }
        }

        isCompleted = true;
        break;
      }

      let dialogStillVisible = false;
      for (const target of getExecutionTargets()) {
        try {
          const dialog = target.locator('[role="dialog"], [role="radiogroup"], form').first();
          if (await dialog.isVisible().catch(() => false)) {
            dialogStillVisible = true;
            break;
          }
        } catch { }
      }

      if (!dialogStillVisible && submitAttempts > 0 && (Date.now() - lastSubmitTime > 2500)) {
        console.log('Report modal completely unmounted/closed after submit. Waiting 4 seconds for you to view result...');
        await new Promise((resolve) => setTimeout(resolve, 4000));
        isCompleted = true;
        break;
      }

      if (submitAttempts < 3 && (Date.now() - lastSubmitTime > 2500)) {
        const clicked = await attemptSubmitClick();
        if (clicked) {
          submitAttempts++;
          lastSubmitTime = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!isCompleted) {
      throw new Error('Report submission failed: Success modal did not appear and form dialog did not close.');
    }

    console.log(`Successfully completed report workflow for category index ${categoryIndex}`);

  } catch (error) {
    console.error('Failed during post-authentication steps:', error);
    throw error;
  }
}