import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PersonalCommentField from './comments/PersonalCommentField.svelte';
import ReviewDisclosure from './reviews/ReviewDisclosure.svelte';
import PlaceCard from './ui/PlaceCard.svelte';

describe('Phase 3 content boundaries', () => {
	it('renders a stable non-photo restaurant fallback with textual identity', async () => {
		const screen = await render(PlaceCard, {
			name: 'Trattoria Verde',
			category: 'restaurant',
			locality: 'Parma',
			visited: true
		});
		await expect.element(screen.getByRole('heading', { name: 'Trattoria Verde' })).toBeVisible();
		await expect.element(screen.getByText('Parma')).toBeVisible();
		await expect.element(screen.getByText('Visited')).toBeVisible();
	});

	it('labels the private note purpose and updates its accessible explicit-save counter', async () => {
		const screen = await render(PersonalCommentField, { value: '', maxLength: 20 });
		const note = screen.getByRole('textbox', { name: 'What would you like to remember?' });
		await note.fill('Quiet table');
		await expect.element(screen.getByText('9 characters remaining')).toBeVisible();
		await expect.element(screen.getByText(/does not affect recommendations/)).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Save private note' })).toBeVisible();
	});

	it('identifies public review content and its verification limitation', async () => {
		const screen = await render(ReviewDisclosure);
		await expect.element(screen.getByText('Optional public review')).toBeVisible();
		await expect.element(screen.getByText(/separate from your private ranking/)).toBeVisible();
	});
});
