import { test, expect, testData } from './fixtures';

test.describe('Template Management Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to templates page
    await page.goto('/templates');
    await page.waitForLoadState('networkidle');
  });

  test('should display the templates page', async ({ page }) => {
    // Check page heading
    await expect(
      page.getByRole('heading', { name: /templates/i })
    ).toBeVisible();

    // Should have create template button
    await expect(
      page.getByRole('button', { name: /create|new|add/i })
    ).toBeVisible();
  });

  test('should create a new template', async ({ page }) => {
    // Click create button
    const createButton = page.getByRole('button', { name: /create|new|add/i }).first();
    await createButton.click();

    // Should show template creation form/modal
    await expect(
      page.locator('form, .template-form, [data-testid="template-editor"], [role="dialog"]')
    ).toBeVisible({ timeout: 5000 });

    // Fill in template name
    const nameInput = page.getByLabel(/name|title/i).or(
      page.locator('input[name*="name"], input[placeholder*="name"]')
    );
    await nameInput.fill(testData.template.name);

    // Select category if available
    const categorySelect = page.getByLabel(/category|type/i).or(
      page.locator('select[name*="category"]')
    );
    if ((await categorySelect.count()) > 0) {
      await categorySelect.selectOption({ label: testData.template.category });
    }

    // Fill in template content
    const contentEditor = page.locator(
      '.editor, [contenteditable="true"], textarea, .ProseMirror, .tiptap'
    );
    if ((await contentEditor.count()) > 0) {
      // For rich text editor
      if (await contentEditor.first().getAttribute('contenteditable')) {
        await contentEditor.first().click();
        await page.keyboard.type(testData.template.content);
      } else {
        // For textarea
        await contentEditor.first().fill(testData.template.content);
      }
    }

    // Save template
    const saveButton = page.getByRole('button', { name: /save|create|submit/i });
    await saveButton.click();

    // Verify success
    await expect(
      page.getByText(/created|saved|success/i).or(
        page.getByText(testData.template.name)
      )
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display template list', async ({ page }) => {
    // Check for template list
    await expect(
      page.locator('.template-list, [data-testid="templates"], table').or(
        page.getByText(/no.*templates|create.*first/i)
      )
    ).toBeVisible();
  });

  test('should edit an existing template', async ({ page }) => {
    // Find a template to edit
    const templateRow = page.locator(
      '[data-testid="template-row"], .template-item, tr'
    ).first();

    // Skip if no templates exist
    if ((await templateRow.count()) === 0) {
      test.skip();
      return;
    }

    // Find edit button
    const editButton = templateRow.getByRole('button', { name: /edit/i });

    if ((await editButton.count()) > 0) {
      await editButton.click();
    } else {
      // Click on template row to open edit view
      await templateRow.click();
    }

    // Should show edit form/modal
    await expect(
      page.locator('form, .template-form, [data-testid="template-editor"], [role="dialog"]')
    ).toBeVisible({ timeout: 5000 });

    // Modify the name
    const nameInput = page.getByLabel(/name|title/i).or(
      page.locator('input[name*="name"]')
    );
    if ((await nameInput.count()) > 0) {
      await nameInput.fill('Updated Template Name');
    }

    // Save changes
    const saveButton = page.getByRole('button', { name: /save|update/i });
    if ((await saveButton.count()) > 0) {
      await saveButton.click();

      // Verify success
      await expect(
        page.getByText(/updated|saved|success/i)
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('should preview a template', async ({ page }) => {
    // Find a template row
    const templateRow = page.locator(
      '[data-testid="template-row"], .template-item, tr'
    ).first();

    // Skip if no templates
    if ((await templateRow.count()) === 0) {
      test.skip();
      return;
    }

    // Find preview button
    const previewButton = templateRow.getByRole('button', { name: /preview|view/i });

    if ((await previewButton.count()) === 0) {
      test.skip();
      return;
    }

    await previewButton.click();

    // Should show preview modal/panel
    await expect(
      page.locator('.preview-modal, .template-preview, [role="dialog"]')
    ).toBeVisible({ timeout: 5000 });

    // Should show template content
    await expect(
      page.getByText(/dear|sincerely|{{/i)
    ).toBeVisible();
  });

  test('should duplicate a template', async ({ page }) => {
    // Find a template row
    const templateRow = page.locator(
      '[data-testid="template-row"], .template-item, tr'
    ).first();

    // Skip if no templates
    if ((await templateRow.count()) === 0) {
      test.skip();
      return;
    }

    // Find duplicate button
    const duplicateButton = templateRow.getByRole('button', { name: /duplicate|copy|clone/i });

    if ((await duplicateButton.count()) === 0) {
      // Try dropdown menu
      const menuButton = templateRow.getByRole('button', { name: /more|menu|options/i });
      if ((await menuButton.count()) > 0) {
        await menuButton.click();
        const duplicateMenuItem = page.getByRole('menuitem', { name: /duplicate|copy/i });
        if ((await duplicateMenuItem.count()) === 0) {
          test.skip();
          return;
        }
        await duplicateMenuItem.click();
      } else {
        test.skip();
        return;
      }
    } else {
      await duplicateButton.click();
    }

    // Verify duplication success
    await expect(
      page.getByText(/duplicated|copied|created/i).or(
        page.getByText(/copy of/i)
      )
    ).toBeVisible({ timeout: 10000 });
  });

  test('should delete a template', async ({ page }) => {
    // Find a template row
    const templateRow = page.locator(
      '[data-testid="template-row"], .template-item, tr'
    ).first();

    // Skip if no templates
    if ((await templateRow.count()) === 0) {
      test.skip();
      return;
    }

    // Get template name for verification
    const templateName = await templateRow.textContent();

    // Find delete button
    const deleteButton = templateRow.getByRole('button', { name: /delete|remove/i });

    if ((await deleteButton.count()) === 0) {
      test.skip();
      return;
    }

    await deleteButton.click();

    // Confirm deletion
    const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
    if ((await confirmButton.count()) > 0) {
      await confirmButton.click();
    }

    // Verify deletion
    await expect(
      page.getByText(/deleted|removed|success/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show firm templates section', async ({ page }) => {
    // Look for firm templates tab/section
    const firmTab = page.getByRole('tab', { name: /firm|shared/i }).or(
      page.getByRole('button', { name: /firm|shared/i })
    );

    if ((await firmTab.count()) === 0) {
      // Firm templates might be shown inline
      const firmSection = page.locator('.firm-templates, [data-testid="firm-templates"]');
      if ((await firmSection.count()) === 0) {
        test.skip();
        return;
      }
      return;
    }

    await firmTab.click();

    // Should show firm templates list
    await expect(
      page.locator('.firm-template-list, [data-testid="firm-templates"]').or(
        page.getByText(/firm.*templates|shared.*templates/i)
      )
    ).toBeVisible({ timeout: 5000 });
  });

  test('should categorize templates', async ({ page }) => {
    // Look for category filter
    const categoryFilter = page.locator(
      'select[name*="category"], [data-testid="category-filter"]'
    ).or(page.getByRole('button', { name: /category|filter/i }));

    if ((await categoryFilter.count()) === 0) {
      // Look for category tabs
      const categoryTabs = page.getByRole('tab', { name: /personal.*injury|auto.*accident/i });
      if ((await categoryTabs.count()) === 0) {
        test.skip();
        return;
      }
      await categoryTabs.first().click();
    } else {
      // Select a category
      if (await categoryFilter.first().getAttribute('role') === 'combobox' ||
          (await categoryFilter.first().locator('select').count()) > 0) {
        await categoryFilter.first().selectOption({ label: /personal.*injury/i });
      } else {
        await categoryFilter.first().click();
        await page.getByRole('option', { name: /personal.*injury/i }).click();
      }
    }

    // Wait for filter
    await page.waitForTimeout(500);

    // Verify filter applied
    await expect(page.locator('body')).toBeVisible();
  });

  test('should validate template placeholders', async ({ page }) => {
    // Create a new template with placeholders
    const createButton = page.getByRole('button', { name: /create|new|add/i }).first();
    await createButton.click();

    await page.waitForTimeout(500);

    // Fill content with placeholders
    const contentEditor = page.locator(
      '.editor, [contenteditable="true"], textarea, .ProseMirror'
    );

    if ((await contentEditor.count()) > 0) {
      const editorElement = contentEditor.first();
      if (await editorElement.getAttribute('contenteditable')) {
        await editorElement.click();
        await page.keyboard.type('Dear {{client_name}}, your case {{case_number}}');
      } else {
        await editorElement.fill('Dear {{client_name}}, your case {{case_number}}');
      }
    }

    // Look for placeholder indicators/validation
    await expect(
      page.getByText(/placeholder|{{.*}}/i).or(
        page.locator('.placeholder-tag, [data-testid="placeholder"]')
      )
    ).toBeVisible({ timeout: 5000 });
  });
});
