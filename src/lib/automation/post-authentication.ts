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

    // 3. Locate and click review's three-dots menu
    // On Google Maps, review action buttons have aria-label like "Actions for [Author]'s review"
    const reviewMenuSelectors = [
      'button[aria-label*="review" i]',
      'button[aria-label*="reseña" i]',
      'button[aria-label*="avaliação" i]',
      'button[aria-label*="vélemény" i]',
      'button[aria-label*="atsiliepim" i]',
      'button[aria-label*="รีวิว" i]',
      'button[aria-label*="recensie" i]',
      'button[aria-label*="recension" i]',
      'button[aria-label*="rezension" i]',
      'button[aria-label*="avis" i]',
      'button.PP3Y3d',
      '[data-review-id] button',
      'button[aria-label*="action" i]:not([aria-label*="search" i]):not([aria-label*="menu" i])'
    ];

    let threeDotsMenu: ReturnType<Page['locator']> | null = null;
    for (const selector of reviewMenuSelectors) {
      const loc = page.locator(selector).first();
      if (await loc.isVisible().catch(() => false)) {
        threeDotsMenu = loc;
        break;
      }
    }

    if (!threeDotsMenu) {
      threeDotsMenu = page.locator('button[aria-label*="review" i], button.PP3Y3d, [data-review-id] button').first();
      await threeDotsMenu.waitFor({ state: 'visible', timeout: 30000 });
    }

    await threeDotsMenu.click();
    await page.waitForTimeout(600);

    // 4. Click "Report review"
    // Google Maps uses role="menuitemradio" (or role="menuitem") inside the review popup menu
    const reportItemExactRegex = /^(report review|report|bejelentés|pranešti|denunciar|รายงาน|melden|rapportera|rezension melden|signaler l'avis)$/i;
    const reportItemContainsRegex = /report review|vélemény bejelentése|denunciar reseña|denunciar avaliação|pranešti apie atsiliepimą|รายงานรีวิว|recensie melden|recension rapportera|rezension melden|signaler/i;

    const newPagePromise = page.context().waitForEvent('page', { timeout: 12000 }).catch(() => null);

    const reportReviewButton = page
      .locator('[role="menuitemradio"], [role="menuitem"], [role="menu"] div, .goog-menuitem')
      .filter({ hasText: reportItemExactRegex })
      .or(
        page.locator('[role="menuitemradio"], [role="menuitem"], [role="menu"] div, .goog-menuitem')
          .filter({ hasText: reportItemContainsRegex })
      )
      .first();

    await reportReviewButton.waitFor({ state: 'visible', timeout: 10000 });
    await reportReviewButton.click({ force: true });

    const newTab = await newPagePromise;
    const activePage = newTab || page;

    if (newTab) {
      console.log('Detected new tab for reporting flow.');
      await activePage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => { });
      await activePage.waitForTimeout(2000);
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

    // 6. Check for "Already reported" screen with client-side render polling
    console.log('Checking for report options or existing report status...');
    const alreadyReportedRegex = /already reported|you've already reported|you have already reported|you reported this|previously reported|already submitted|previously submitted|คุณได้รายงาน|já denunciado|már bejelentve|jau pranešta|bereits gemeldet|déjà signalé/i;

    let optionSelected = false;
    let activeTarget: Page | Frame = activePage;

    // Poll to allow async client-side rendering of "Already reported" status
    for (let poll = 0; poll < 6; poll++) {
      for (const target of getExecutionTargets()) {
        const bodyText = await target.evaluate(() => document.body?.innerText || '').catch(() => '');
        if (alreadyReportedRegex.test(bodyText)) {
          console.log('Detected "Already reported" screen on load. Waiting 4 seconds for you to view, then marking as completed.');
          await new Promise((resolve) => setTimeout(resolve, 4000));
          return;
        }
      }
      await activePage.waitForTimeout(500);
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
              if (box && box.y > 100) {
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

    // Fallback: Scoped Evaluator filtering out Header elements and non-option text
    if (!optionSelected) {
      console.log('Standard selectors missed. Scanning for option body text (excluding headers)...');
      const titleHeaderRegex = /report review|รายงานรีวิว|bejelentés|pranešti|denunciar|melden/i;
      const blacklistTextRegex = /privacy|terms|policy|google|cookie|feedback|about|help|review|stars|opinions about maps/i;

      for (const target of getExecutionTargets()) {
        const optionBoxes = await target.evaluate((args) => {
          const headerPattern = new RegExp(args.headerPatternStr, 'i');
          const blacklistPattern = new RegExp(args.blacklistPatternStr, 'i');
          const container = document.querySelector('[role="radiogroup"], [role="dialog"], form, [role="list"], .quantumWizRadiogroup') || (args.isNewTab ? document.querySelector('main, body') : null);
          if (!container) return [];

          const elements = Array.from(container.querySelectorAll('div, label, li, span')).filter((el) => {
            const htmlEl = el as HTMLElement;
            const rect = htmlEl.getBoundingClientRect();
            const text = (htmlEl.innerText || '').trim();

            const isBelowHeader = rect.top >= 120;
            const isVisible = rect.width > 120 && rect.height >= 20 && rect.height <= 100;
            const isNotTitleText = !headerPattern.test(text);
            const isNotBlacklist = !blacklistPattern.test(text);
            const isValidTextLength = text.length >= 4 && text.length <= 80;

            return isBelowHeader && isVisible && isNotTitleText && isNotBlacklist && isValidTextLength;
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
        }, { headerPatternStr: titleHeaderRegex.source, blacklistPatternStr: blacklistTextRegex.source, isNewTab: Boolean(newTab) }).catch(() => []);

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
      // Final re-check: did the page say "Already reported" while we were searching?
      for (const target of getExecutionTargets()) {
        const bodyText = await target.evaluate(() => document.body?.innerText || '').catch(() => '');
        if (alreadyReportedRegex.test(bodyText)) {
          console.log('Detected "Already reported" confirmation on screen during fallback scan. Marking as completed.');
          await new Promise((resolve) => setTimeout(resolve, 4000));
          return;
        }
      }

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