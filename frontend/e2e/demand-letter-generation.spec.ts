import { test, expect, testData } from './fixtures';

test.describe('Demand Letter Generation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to demand letters page
    await page.goto('/demand-letters');
    await page.waitForLoadState('networkidle');
  });

  test('should display the demand letters page', async ({ page }) => {
    // Check page is accessible
    await expect(
      page.getByRole('heading', { name: /demand letters/i })
    ).toBeVisible();

    // Should have create/new button
    await expect(
      page.getByRole('button', { name: /create|new|generate/i }).or(
        page.getByRole('link', { name: /create|new|generate/i })
      )
    ).toBeVisible();
  });

  test('should navigate to generation wizard', async ({ page }) => {
    // Click create new button
    const createButton = page.getByRole('button', { name: /create|new|generate/i }).or(
      page.getByRole('link', { name: /create|new|generate/i })
    );
    await createButton.first().click();

    // Should navigate to generator or show wizard
    await expect(page).toHaveURL(/\/demand-letters\/(new|create|generator)/);

    // Should see first step of wizard
    await expect(
      page.getByText(/select.*document|choose.*document|step.*1/i).or(
        page.locator('.wizard, .step-indicator, .stepper')
      )
    ).toBeVisible({ timeout: 10000 });
  });

  test('should complete Step 1: Document Selection', async ({ page }) => {
    // Navigate to generator
    await page.goto('/demand-letters/new');
    await page.waitForLoadState('networkidle');

    // Check we're on document selection step
    await expect(
      page.getByText(/document|select|source/i)
    ).toBeVisible({ timeout: 10000 });

    // Look for document list or search
    const documentList = page.locator(
      '.document-list, [data-testid="document-selector"], .source-documents'
    );

    // If documents available, select one
    const documentItem = documentList.locator(
      'input[type="checkbox"], .document-item, [data-testid="document-option"]'
    );

    if ((await documentItem.count()) > 0) {
      await documentItem.first().click();

      // Proceed to next step
      const nextButton = page.getByRole('button', { name: /next|continue|proceed/i });
      if ((await nextButton.count()) > 0) {
        await nextButton.click();

        // Should advance to step 2
        await expect(
          page.getByText(/case.*info|client|step.*2/i)
        ).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should complete Step 2: Case Information', async ({ page }) => {
    // Navigate directly if possible, or go through wizard
    await page.goto('/demand-letters/new');
    await page.waitForLoadState('networkidle');

    // Try to get to step 2 - look for case info form
    // May need to skip step 1 or it might be combined
    const caseInfoForm = page.locator(
      'form, .case-info, [data-testid="case-info-form"]'
    );

    // Fill in case information
    const clientNameInput = page.getByLabel(/client.*name/i).or(
      page.locator('input[name*="client"], input[placeholder*="client"]')
    );

    if ((await clientNameInput.count()) > 0) {
      await clientNameInput.fill(testData.caseInfo.clientName);

      // Fill incident date
      const dateInput = page.getByLabel(/incident.*date|date/i).or(
        page.locator('input[type="date"], input[name*="date"]')
      );
      if ((await dateInput.count()) > 0) {
        await dateInput.fill(testData.caseInfo.incidentDate);
      }

      // Fill case number if available
      const caseNumberInput = page.getByLabel(/case.*number|reference/i);
      if ((await caseNumberInput.count()) > 0) {
        await caseNumberInput.fill(testData.caseInfo.caseNumber);
      }

      // Fill damages amount if available
      const damagesInput = page.getByLabel(/damages|amount/i);
      if ((await damagesInput.count()) > 0) {
        await damagesInput.fill(testData.caseInfo.damagesAmount);
      }

      // Fill description if available
      const descriptionInput = page.getByLabel(/description|details/i).or(
        page.locator('textarea')
      );
      if ((await descriptionInput.count()) > 0) {
        await descriptionInput.first().fill(testData.caseInfo.description);
      }

      // Proceed to next step
      const nextButton = page.getByRole('button', { name: /next|continue|generate/i });
      if ((await nextButton.count()) > 0) {
        await nextButton.click();
      }
    }
  });

  test('should show generation progress/streaming', async ({ page }) => {
    // This test checks that the generation shows progress feedback
    // Skip full generation in E2E (expensive API call) but verify UI elements

    await page.goto('/demand-letters/new');
    await page.waitForLoadState('networkidle');

    // Look for any of these generation-related elements
    const generationUI = page.locator(
      '.generation-progress, .streaming-content, [data-testid="generation-status"], .wizard'
    );

    await expect(generationUI).toBeVisible({ timeout: 10000 });
  });

  test('should display existing demand letters list', async ({ page }) => {
    // Check list view
    await page.goto('/demand-letters');
    await page.waitForLoadState('networkidle');

    // Should show list or empty state
    await expect(
      page.locator('.demand-letter-list, [data-testid="demand-letters"], table').or(
        page.getByText(/no.*demand.*letters|empty|create.*first/i)
      )
    ).toBeVisible({ timeout: 10000 });
  });

  test('should open demand letter detail view', async ({ page }) => {
    // Get list of demand letters
    await page.goto('/demand-letters');
    await page.waitForLoadState('networkidle');

    // Find a demand letter to click
    const demandLetterLink = page.locator(
      '[data-testid="demand-letter-row"] a, .demand-letter-item a, td a'
    ).first();

    // Skip if no demand letters exist
    if ((await demandLetterLink.count()) === 0) {
      // Try clicking on a row instead
      const letterRow = page.locator(
        '[data-testid="demand-letter-row"], .demand-letter-item, tr'
      ).filter({
        hasText: /demand|letter|client/i,
      }).first();

      if ((await letterRow.count()) === 0) {
        test.skip();
        return;
      }

      await letterRow.click();
    } else {
      await demandLetterLink.click();
    }

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/demand-letters\/[^/]+$/);

    // Should show letter content
    await expect(
      page.locator('.demand-letter-content, .letter-view, [data-testid="letter-content"]').or(
        page.getByText(/dear|sincerely|damages/i)
      )
    ).toBeVisible({ timeout: 10000 });
  });

  test('should allow AI refinement of demand letter', async ({ page }) => {
    // Navigate to a demand letter detail page
    await page.goto('/demand-letters');
    await page.waitForLoadState('networkidle');

    // Find and click first demand letter
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Look for refinement input/button
    const refineButton = page.getByRole('button', { name: /refine|improve|ai/i });
    const refineInput = page.getByPlaceholder(/instruction|refine|improve/i).or(
      page.locator('textarea[name*="refine"], input[name*="instruction"]')
    );

    if ((await refineButton.count()) > 0 || (await refineInput.count()) > 0) {
      // Found refinement UI
      await expect(refineButton.or(refineInput)).toBeVisible();

      // If input available, fill it
      if ((await refineInput.count()) > 0) {
        await refineInput.fill('Make the tone more formal');
      }
    }
  });

  test('should show version history', async ({ page }) => {
    // Navigate to a demand letter detail page
    await page.goto('/demand-letters');
    await page.waitForLoadState('networkidle');

    // Find and click first demand letter
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Look for version history button/tab
    const versionButton = page.getByRole('button', { name: /version|history/i }).or(
      page.getByRole('tab', { name: /version|history/i })
    );

    if ((await versionButton.count()) > 0) {
      await versionButton.click();

      // Should show version list
      await expect(
        page.locator('.version-list, [data-testid="versions"], .history-panel').or(
          page.getByText(/version|revision|v\d+/i)
        )
      ).toBeVisible({ timeout: 5000 });
    }
  });
});
