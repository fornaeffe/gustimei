import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import * as m from '$lib/paraglide/messages';
import { getLocale, localizeHref } from '$lib/paraglide/runtime';
import DashboardPage from './+page.svelte';

describe('dashboard restaurant ranking card', () => {
	it('links a published ranking and replaces the setup-only guidance', async () => {
		const screen = await render(DashboardPage, {
			data: {
				user: { email: 'developer@example.test', emailVerified: true },
				email: 'developer@example.test',
				emailVerified: true,
				restaurantPlaces: 10,
				restaurantRanking: {
					sessionId: 'session-1',
					rankedPlaces: 9,
					unresolvedPlaces: 1
				}
			}
		});

		await expect.element(screen.getByText(m.dashboard_ranking_ready_intro())).toBeVisible();
		await expect.element(screen.getByText(m.dashboard_intro())).not.toBeInTheDocument();
		await expect
			.element(screen.getByRole('link', { name: m.view_restaurant_ranking() }))
			.toHaveAttribute(
				'href',
				localizeHref('/ranking/restaurants/session/session-1', { locale: getLocale() })
			);
	});
});
