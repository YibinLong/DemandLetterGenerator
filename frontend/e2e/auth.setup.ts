import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

/**
 * Authentication Setup
 *
 * This setup runs before all tests to authenticate and store the session.
 * It uses the seeded test user credentials from the backend.
 */
setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login');

  // Wait for login form to be visible
  await expect(page.locator('h1')).toContainText(/welcome/i, { timeout: 10000 });

  // Fill in login credentials (seeded test user)
  await page.getByLabel('Email').fill('admin@andersonlaw.com');
  await page.getByLabel('Password').fill('password123');

  // Click login button
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for successful login - check we're no longer on login page
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });

  // Wait for any dashboard content to be visible (sidebar navigation or main content)
  await expect(
    page.getByRole('navigation').or(page.locator('.main-layout')).or(page.locator('.dashboard'))
  ).toBeVisible({ timeout: 10000 });

  // Save the authenticated state
  await page.context().storageState({ path: authFile });
});
