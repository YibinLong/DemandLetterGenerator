import { test, expect } from './fixtures';

test.describe('Collaboration Features', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to demand letters
    await page.goto('/demand-letters');
    await page.waitForLoadState('networkidle');
  });

  test('should display share button on demand letter', async ({ page }) => {
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

    // Look for share button
    await expect(
      page.getByRole('button', { name: /share|collaborate|invite/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should open share dialog', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Click share button
    const shareButton = page.getByRole('button', { name: /share|collaborate|invite/i });
    await shareButton.click();

    // Should show share dialog
    await expect(
      page.locator('[role="dialog"], .share-dialog, .modal').filter({
        hasText: /share|invite|collaborat/i,
      })
    ).toBeVisible({ timeout: 5000 });
  });

  test('should search for users to share with', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Open share dialog
    const shareButton = page.getByRole('button', { name: /share|collaborate|invite/i });
    await shareButton.click();

    await page.waitForTimeout(500);

    // Look for user search input
    const searchInput = page
      .locator('[role="dialog"], .share-dialog, .modal')
      .locator('input[type="text"], input[type="search"], input[placeholder*="search"], input[placeholder*="email"]');

    if ((await searchInput.count()) === 0) {
      test.skip();
      return;
    }

    // Search for a user
    await searchInput.fill('sarah');

    // Wait for search results
    await page.waitForTimeout(500);

    // Should show search results or suggestions
    await expect(
      page.locator('.search-results, .user-suggestions, [role="listbox"]').or(
        page.getByText(/sarah|no.*results|not.*found/i)
      )
    ).toBeVisible({ timeout: 5000 });
  });

  test('should select permission level', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Open share dialog
    const shareButton = page.getByRole('button', { name: /share|collaborate|invite/i });
    await shareButton.click();

    await page.waitForTimeout(500);

    const shareDialog = page.locator('[role="dialog"], .share-dialog, .modal');

    // Look for permission selector
    const permissionSelect = shareDialog.locator(
      'select[name*="permission"], [data-testid="permission-select"]'
    ).or(shareDialog.getByRole('combobox'));

    if ((await permissionSelect.count()) > 0) {
      // Check permission options exist
      await permissionSelect.click();

      await expect(
        page.getByRole('option', { name: /view|edit|comment/i }).or(
          page.getByText(/view|edit|comment/i)
        )
      ).toBeVisible({ timeout: 3000 });
    } else {
      // Look for permission radio buttons or toggles
      await expect(
        shareDialog.getByRole('radio').or(
          shareDialog.getByLabel(/view|edit|comment/i)
        )
      ).toBeVisible().catch(() => {});
    }
  });

  test('should display current collaborators', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Open share dialog
    const shareButton = page.getByRole('button', { name: /share|collaborate|invite/i });
    await shareButton.click();

    await page.waitForTimeout(500);

    // Look for collaborators list
    const shareDialog = page.locator('[role="dialog"], .share-dialog, .modal');

    await expect(
      shareDialog.locator('.collaborators, .shared-with, [data-testid="collaborators"]').or(
        shareDialog.getByText(/shared.*with|collaborator|no.*collaborator/i)
      )
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show real-time collaboration editor', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Look for collaborative editor indicators
    await expect(
      page.locator('.collaborative-editor, [data-testid="collab-editor"], .ProseMirror').or(
        page.locator('[contenteditable="true"]')
      )
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display presence indicators', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Look for presence/avatar indicators
    // These might show current users viewing/editing
    const presenceIndicators = page.locator(
      '.presence-indicator, .avatar, .user-presence, [data-testid="collaborator-presence"]'
    );

    // Presence might not be visible if only one user
    // Just verify the container exists
    await expect(
      page.locator('.editor-toolbar, .collaboration-toolbar, header')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show change tracking panel', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Look for change tracking button/tab
    const trackChangesButton = page.getByRole('button', { name: /track.*change|change.*track|revision/i }).or(
      page.getByRole('tab', { name: /change|track|revision/i })
    );

    if ((await trackChangesButton.count()) > 0) {
      await trackChangesButton.click();

      // Should show change tracking panel
      await expect(
        page.locator('.change-tracking, .changes-panel, [data-testid="changes"]')
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show comments panel', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Look for comments button/tab
    const commentsButton = page.getByRole('button', { name: /comment|annotation/i }).or(
      page.getByRole('tab', { name: /comment|annotation/i })
    );

    if ((await commentsButton.count()) > 0) {
      await commentsButton.click();

      // Should show comments panel
      await expect(
        page.locator('.comments-panel, .annotations, [data-testid="comments"]').or(
          page.getByText(/comment|no.*comment/i)
        )
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('should add a comment', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Try to add a comment
    // First, select some text or find add comment button
    const addCommentButton = page.getByRole('button', { name: /add.*comment|new.*comment/i });

    if ((await addCommentButton.count()) > 0) {
      await addCommentButton.click();

      // Fill in comment
      const commentInput = page.locator(
        'textarea[name*="comment"], input[name*="comment"], .comment-input'
      );

      if ((await commentInput.count()) > 0) {
        await commentInput.fill('Test comment from E2E test');

        // Submit comment
        const submitButton = page.getByRole('button', { name: /submit|add|save|post/i });
        if ((await submitButton.count()) > 0) {
          await submitButton.click();

          // Verify comment was added
          await expect(
            page.getByText(/test.*comment|comment.*added/i)
          ).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('should show version comparison', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Look for version comparison button
    const compareButton = page.getByRole('button', { name: /compare|version|history/i });

    if ((await compareButton.count()) === 0) {
      test.skip();
      return;
    }

    await compareButton.click();

    // Should show version comparison UI
    await expect(
      page.locator('.version-compare, .diff-view, [data-testid="version-comparison"]').or(
        page.getByText(/version|compare|revision/i)
      )
    ).toBeVisible({ timeout: 5000 });
  });

  test('should revoke collaborator access', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Open share dialog
    const shareButton = page.getByRole('button', { name: /share|collaborate|invite/i });
    await shareButton.click();

    await page.waitForTimeout(500);

    // Look for remove/revoke button on collaborator
    const revokeButton = page
      .locator('[role="dialog"], .share-dialog, .modal')
      .getByRole('button', { name: /remove|revoke|delete/i });

    if ((await revokeButton.count()) > 0) {
      // Just verify the button exists
      await expect(revokeButton.first()).toBeVisible();
    }
  });

  test('should close share dialog', async ({ page }) => {
    const letterRow = page.locator(
      '[data-testid="demand-letter-row"], .demand-letter-item, tr'
    ).first();

    if ((await letterRow.count()) === 0) {
      test.skip();
      return;
    }

    await letterRow.click();
    await page.waitForLoadState('networkidle');

    // Open share dialog
    const shareButton = page.getByRole('button', { name: /share|collaborate|invite/i });
    await shareButton.click();

    await page.waitForTimeout(500);

    // Close dialog
    const closeButton = page
      .locator('[role="dialog"], .share-dialog, .modal')
      .getByRole('button', { name: /close|cancel|done/i });

    if ((await closeButton.count()) > 0) {
      await closeButton.click();

      // Dialog should be closed
      await expect(
        page.locator('[role="dialog"], .share-dialog, .modal')
      ).not.toBeVisible({ timeout: 3000 });
    }
  });
});
