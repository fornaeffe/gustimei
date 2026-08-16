import { expect, test } from '@playwright/test';

test('serves the product landing page from the production Node build', async ({ page }) => {
	await page.goto('/en');

	await expect(page).toHaveTitle(/GustiMei/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('preferences, not ratings');
	await expect(page.getByRole('link', { name: 'Start with restaurants' })).toBeVisible();
	await expect(page.getByText('Tie or skip are always available')).toBeVisible();
});

test('keeps the landing experience and navigation localized in Italian', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('preferenze, non i punteggi');
	await expect(page.getByRole('link', { name: 'Inizia dai ristoranti' })).toHaveAttribute(
		'href',
		'/auth/sign-up'
	);
});

test('switches the current page between English and Italian', async ({ page }) => {
	await page.goto('/en');

	const italianSwitch = page.getByRole('link', { name: 'IT', exact: true });
	await expect(italianSwitch).toHaveAttribute('href', '/');
	await italianSwitch.click();
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('preferenze, non i punteggi');

	const englishSwitch = page.getByRole('link', { name: 'EN', exact: true });
	await expect(englishSwitch).toHaveAttribute('href', '/en/');
	await englishSwitch.click();
	await expect(page).toHaveURL(/\/en\/?$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('preferences, not ratings');
});
