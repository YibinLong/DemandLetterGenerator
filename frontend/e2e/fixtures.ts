import { test as base, expect } from '@playwright/test';
import path from 'path';

/**
 * Extended test fixtures for E2E tests
 * Provides common helpers and test data
 */

// Test data for various workflows
export const testData = {
  // Seeded user credentials
  user: {
    email: 'admin@andersonlaw.com',
    password: 'password123',
    name: 'Admin User',
  },

  // Case information for demand letter generation
  caseInfo: {
    clientName: 'John Smith',
    incidentDate: '2024-06-15',
    caseNumber: 'DL-2024-001',
    injuryType: 'Personal Injury - Auto Accident',
    damagesAmount: '75000',
    description: 'Client was rear-ended at a traffic light',
  },

  // Template data
  template: {
    name: 'E2E Test Template',
    description: 'Template created during E2E testing',
    category: 'Personal Injury',
    content: `Dear {{recipient_name}},

This letter is to formally demand compensation for injuries sustained by {{client_name}} on {{incident_date}}.

{{case_description}}

We demand the sum of ${{damages_amount}} for damages.

Sincerely,
{{attorney_name}}`,
  },

  // Sample document for upload tests
  sampleDocument: {
    name: 'test-document.txt',
    content: `INCIDENT REPORT
================

Date: June 15, 2024
Location: Main Street & Oak Avenue

Description:
Our client, John Smith, was driving his 2020 Honda Accord southbound on Main Street.
At approximately 3:45 PM, while stopped at a red light at the intersection of Main Street
and Oak Avenue, his vehicle was struck from behind by a 2019 Ford F-150.

The impact caused significant damage to the rear of our client's vehicle and resulted
in immediate neck and back pain. Mr. Smith was transported to General Hospital by ambulance.

Medical Treatment:
- Emergency Room visit on June 15, 2024
- Follow-up with orthopedic specialist on June 22, 2024
- Physical therapy sessions (ongoing)

Damages:
- Vehicle repair costs: $8,500
- Medical expenses to date: $15,750
- Lost wages: $4,200
- Pain and suffering: TBD

The at-fault driver's insurance company has been notified and claim number 2024-AUTO-56789
has been assigned.
`,
  },
};

// Custom test fixture with helpers
export const test = base.extend<{
  /**
   * Navigate to a specific page with authentication check
   */
  navigateTo: (path: string) => Promise<void>;

  /**
   * Wait for the page to be fully loaded
   */
  waitForPageLoad: () => Promise<void>;

  /**
   * Get API base URL
   */
  apiBaseUrl: string;
}>({
  navigateTo: async ({ page }, use) => {
    const navigate = async (pagePath: string) => {
      await page.goto(pagePath);
      await page.waitForLoadState('networkidle');
    };
    await use(navigate);
  },

  waitForPageLoad: async ({ page }, use) => {
    const wait = async () => {
      await page.waitForLoadState('networkidle');
      // Also wait for any loading spinners to disappear
      const spinner = page.locator('.loading-spinner, [data-testid="loading"]');
      if (await spinner.count() > 0) {
        await expect(spinner.first()).not.toBeVisible({ timeout: 30000 });
      }
    };
    await use(wait);
  },

  apiBaseUrl: async ({}, use) => {
    await use(process.env.E2E_API_URL || 'http://localhost:3001');
  },
});

export { expect } from '@playwright/test';

/**
 * Helper to create a test file
 */
export async function createTestFile(
  filename: string,
  content: string
): Promise<string> {
  const fs = await import('fs/promises');
  const os = await import('os');

  const tempDir = os.tmpdir();
  const filePath = path.join(tempDir, filename);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Helper to clean up test files
 */
export async function cleanupTestFile(filePath: string): Promise<void> {
  const fs = await import('fs/promises');
  try {
    await fs.unlink(filePath);
  } catch {
    // File may already be deleted
  }
}

/**
 * Helper to wait for a toast notification
 */
export async function waitForToast(
  page: import('@playwright/test').Page,
  text: string | RegExp,
  type: 'success' | 'error' | 'info' = 'success'
): Promise<void> {
  const toast = page.locator(`.toast, [role="alert"], .notification`).filter({
    hasText: text,
  });
  await expect(toast).toBeVisible({ timeout: 10000 });
}

/**
 * Helper to dismiss any open modals/dialogs
 */
export async function dismissModal(
  page: import('@playwright/test').Page
): Promise<void> {
  const closeButton = page.locator(
    '[aria-label="Close"], .modal-close, .dialog-close, button:has-text("Close")'
  );
  if ((await closeButton.count()) > 0) {
    await closeButton.first().click();
    await page.waitForTimeout(300); // Wait for animation
  }
}
