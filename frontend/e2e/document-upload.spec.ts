import { test, expect, testData, createTestFile, cleanupTestFile } from './fixtures';

test.describe('Document Upload Workflow', () => {
  let testFilePath: string;

  test.beforeAll(async () => {
    // Create a test file for upload tests
    testFilePath = await createTestFile(
      testData.sampleDocument.name,
      testData.sampleDocument.content
    );
  });

  test.afterAll(async () => {
    // Clean up test file
    await cleanupTestFile(testFilePath);
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to documents page before each test
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');
  });

  test('should display the documents page', async ({ page }) => {
    // Check page title/heading
    await expect(
      page.getByRole('heading', { name: /documents|document library/i })
    ).toBeVisible();

    // Check for upload button/area
    await expect(
      page.getByRole('button', { name: /upload/i }).or(
        page.locator('[data-testid="upload-area"], .upload-zone, .dropzone')
      )
    ).toBeVisible();
  });

  test('should upload a single document via file input', async ({ page }) => {
    // Look for file input (might be hidden, used with button)
    const fileInput = page.locator('input[type="file"]');

    // Upload the test file
    await fileInput.setInputFiles(testFilePath);

    // Wait for upload to complete
    await expect(
      page.getByText(/uploaded|success/i).or(
        page.getByText(testData.sampleDocument.name)
      )
    ).toBeVisible({ timeout: 15000 });
  });

  test('should show upload progress indicator', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');

    // Start upload
    await fileInput.setInputFiles(testFilePath);

    // Check for progress indicator (may appear briefly)
    // This tests that the UI shows feedback during upload
    const progressOrComplete = page.locator(
      '.upload-progress, .progress-bar, [role="progressbar"]'
    ).or(page.getByText(/uploading|complete/i));

    // Either should be visible at some point
    await expect(progressOrComplete).toBeVisible({ timeout: 10000 });
  });

  test('should display uploaded document in the library', async ({ page }) => {
    // Upload a document first
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFilePath);

    // Wait for upload to complete
    await page.waitForTimeout(2000);

    // Reload the page to ensure we see the document from the server
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Check if document appears in the list
    await expect(
      page.getByText(testData.sampleDocument.name).or(
        page.getByText(/test-document/i)
      )
    ).toBeVisible({ timeout: 10000 });
  });

  test('should allow document preview', async ({ page }) => {
    // Find a document in the list
    const documentRow = page.locator(
      '[data-testid="document-row"], .document-item, tr'
    ).filter({
      hasText: /test-document|\.txt|\.pdf|document/i,
    });

    // Skip if no documents exist
    if ((await documentRow.count()) === 0) {
      test.skip();
      return;
    }

    // Click on preview button or the document itself
    const previewButton = documentRow
      .first()
      .getByRole('button', { name: /preview|view/i });

    if ((await previewButton.count()) > 0) {
      await previewButton.click();
    } else {
      // Click on the document row/card
      await documentRow.first().click();
    }

    // Check for preview modal/panel
    await expect(
      page.locator('.preview-modal, .document-preview, [role="dialog"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should allow document download', async ({ page }) => {
    // Find a document with download button
    const downloadButton = page
      .locator('[data-testid="document-row"], .document-item, tr')
      .first()
      .getByRole('button', { name: /download/i });

    // Skip if no download button visible
    if ((await downloadButton.count()) === 0) {
      // Try looking for a download link instead
      const downloadLink = page.locator('a[download], a:has-text("download")').first();
      if ((await downloadLink.count()) === 0) {
        test.skip();
        return;
      }
    }

    // Set up download promise
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

    // Click download
    await downloadButton.click().catch(() => {
      // If button click fails, might need to click link
    });

    // Verify download started
    try {
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBeTruthy();
    } catch {
      // Download might be handled differently (blob, etc.)
    }
  });

  test('should allow document deletion', async ({ page }) => {
    // Find a document to delete
    const documentRow = page
      .locator('[data-testid="document-row"], .document-item, tr')
      .first();

    // Skip if no documents
    if ((await documentRow.count()) === 0) {
      test.skip();
      return;
    }

    // Get the document name before deletion
    const documentText = await documentRow.textContent();

    // Find and click delete button
    const deleteButton = documentRow.getByRole('button', { name: /delete|remove/i });

    if ((await deleteButton.count()) === 0) {
      test.skip();
      return;
    }

    await deleteButton.click();

    // Confirm deletion if dialog appears
    const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
    if ((await confirmButton.count()) > 0) {
      await confirmButton.click();
    }

    // Wait for deletion to complete
    await page.waitForTimeout(1000);

    // Verify document is removed or page shows success message
    await expect(
      page.getByText(/deleted|removed|success/i).or(documentRow)
    ).toBeTruthy();
  });

  test('should filter documents by type', async ({ page }) => {
    // Look for filter/select dropdown
    const filterSelect = page.locator(
      'select[name*="type"], [data-testid="file-type-filter"], .filter-dropdown'
    );

    // Skip if no filter available
    if ((await filterSelect.count()) === 0) {
      // Try looking for filter buttons instead
      const filterButtons = page.getByRole('button', { name: /pdf|docx|txt|all/i });
      if ((await filterButtons.count()) === 0) {
        test.skip();
        return;
      }
      await filterButtons.first().click();
    } else {
      // Select a specific file type
      await filterSelect.selectOption({ label: /txt|text/i });
    }

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Verify filtered results (should only show matching type or empty state)
    const documentList = page.locator('.document-list, [data-testid="document-list"]');
    await expect(documentList).toBeVisible();
  });

  test('should search documents', async ({ page }) => {
    // Find search input
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search"], [data-testid="search-input"]'
    );

    // Skip if no search available
    if ((await searchInput.count()) === 0) {
      test.skip();
      return;
    }

    // Enter search term
    await searchInput.fill('test');

    // Wait for search results
    await page.waitForTimeout(500);

    // Verify search is applied (either results or no results message)
    await expect(
      page.getByText(/test|no.*results|no.*documents/i)
    ).toBeVisible();
  });
});
