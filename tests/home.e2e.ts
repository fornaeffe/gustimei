import { expect, test } from '@playwright/test';

test('serves the product landing page from the production Node build', async ({ page }) => {
	await page.goto('/en');

	await expect(page).toHaveTitle('GustiMei');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('preferences, not ratings');
});
