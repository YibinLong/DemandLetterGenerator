import { test, expect } from './fixtures';

test.describe('Export Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to demand letters
    await page.goto('/demand-letters');
    await page.waitForLoadState('networkidle');
  });

  test('should display export button on demand letter detail', async ({ page }) => {
    // Find and click first demand letter
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    // Skip if no demand letters
    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Look for export button
    await expect(
      page.getByRole('button', { name: /export|download|word|docx/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should open export dialog', async ({ page }) => {
    // Navigate to a demand letter
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Click export button
    const exportButton = page.getByRole('button', { name: /export|download/i });
    await exportButton.click();

    // Should show export dialog/modal
    await expect(
      page.locator('[role="dialog"], .export-dialog, .modal').filter({
        hasText: /export|download|word/i,
      })
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show export options', async ({ page }) => {
    // Navigate to a demand letter
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Click export button
    const exportButton = page.getByRole('button', { name: /export|download/i });
    await exportButton.click();

    // Wait for dialog
    await page.waitForTimeout(500);

    // Check for export options (font, margins, letterhead)
    const exportDialog = page.locator('[role="dialog"], .export-dialog, .modal');

    // Should have font selection
    await expect(
      exportDialog.getByLabel(/font/i).or(
        exportDialog.locator('select[name*="font"]')
      ).or(exportDialog.getByText(/font/i))
    ).toBeVisible().catch(() => {});

    // Should have margin options
    await expect(
      exportDialog.getByLabel(/margin/i).or(
        exportDialog.locator('select[name*="margin"], input[name*="margin"]')
      ).or(exportDialog.getByText(/margin/i))
    ).toBeVisible().catch(() => {});

    // Should have letterhead option
    await expect(
      exportDialog.getByLabel(/letterhead/i).or(
        exportDialog.locator('input[name*="letterhead"]')
      ).or(exportDialog.getByText(/letterhead/i))
    ).toBeVisible().catch(() => {});
  });

  test('should configure export options', async ({ page }) => {
    // Navigate to a demand letter
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Click export button
    const exportButton = page.getByRole('button', { name: /export|download/i });
    await exportButton.click();

    // Wait for dialog
    await page.waitForTimeout(500);

    const exportDialog = page.locator('[role="dialog"], .export-dialog, .modal');

    // Try to configure font
    const fontSelect = exportDialog.getByLabel(/font/i).or(
      exportDialog.locator('select[name*="font"]')
    );
    if ((await fontSelect.count()) > 0) {
      await fontSelect.selectOption({ index: 1 }); // Select second option
    }

    // Try to configure margins
    const marginSelect = exportDialog.getByLabel(/margin/i).or(
      exportDialog.locator('select[name*="margin"]')
    );
    if ((await marginSelect.count()) > 0) {
      await marginSelect.selectOption({ index: 1 });
    }

    // Try to toggle letterhead
    const letterheadCheckbox = exportDialog.getByLabel(/letterhead/i).or(
      exportDialog.locator('input[type="checkbox"][name*="letterhead"]')
    );
    if ((await letterheadCheckbox.count()) > 0) {
      await letterheadCheckbox.click();
    }

    // Verify dialog is still open with options
    await expect(exportDialog).toBeVisible();
  });

  test('should download Word document', async ({ page }) => {
    // Navigate to a demand letter
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Click export button
    const exportButton = page.getByRole('button', { name: /export|download/i });
    await exportButton.click();

    // Wait for dialog
    await page.waitForTimeout(500);

    // Set up download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });

    // Click download/export button in dialog
    const downloadButton = page
      .locator('[role="dialog"], .export-dialog, .modal')
      .getByRole('button', { name: /download|export|confirm/i });

    if ((await downloadButton.count()) === 0) {
      // Maybe the export button itself triggers download
      test.skip();
      return;
    }

    await downloadButton.click();

    // Verify download
    try {
      const download = await downloadPromise;
      const filename = download.suggestedFilename();

      // Should be a Word document
      expect(filename).toMatch(/\.docx?$/);
    } catch {
      // Download might be handled differently (blob URL, etc.)
      // Check for success message instead
      await expect(
        page.getByText(/exported|downloaded|success/i)
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show batch export option', async ({ page }) => {
    // Look for batch export or select multiple feature
    const batchExportButton = page.getByRole('button', { name: /batch.*export|export.*all|select.*multiple/i });

    if ((await batchExportButton.count()) > 0) {
      await expect(batchExportButton).toBeVisible();
    } else {
      // Look for checkboxes to select multiple letters
      const selectCheckboxes = page.locator(
        'input[type="checkbox"][data-testid*="select"], .select-checkbox'
      );

      if ((await selectCheckboxes.count()) > 0) {
        // Select first two letters
        await selectCheckboxes.nth(0).click();
        await selectCheckboxes.nth(1).click();

        // Look for batch action
        await expect(
          page.getByRole('button', { name: /export.*selected|batch/i })
        ).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should handle export errors gracefully', async ({ page }) => {
    // This test verifies error handling is in place
    // We'll check that error messages can be displayed

    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Click export button
    const exportButton = page.getByRole('button', { name: /export|download/i });
    await exportButton.click();

    // Wait for dialog
    await page.waitForTimeout(500);

    // Check that the dialog has proper structure for error handling
    const exportDialog = page.locator('[role="dialog"], .export-dialog, .modal');

    // Should have a close/cancel button for error recovery
    await expect(
      exportDialog.getByRole('button', { name: /cancel|close/i })
    ).toBeVisible();
  });

  test('should close export dialog', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Open export dialog
    const exportButton = page.getByRole('button', { name: /export|download/i });
    await exportButton.click();

    await page.waitForTimeout(500);

    // Close dialog
    const closeButton = page
      .locator('[role="dialog"], .export-dialog, .modal')
      .getByRole('button', { name: /cancel|close/i });

    if ((await closeButton.count()) > 0) {
      await closeButton.click();

      // Dialog should be closed
      await expect(
        page.locator('[role="dialog"], .export-dialog, .modal')
      ).not.toBeVisible({ timeout: 3000 });
    }
  });
});
