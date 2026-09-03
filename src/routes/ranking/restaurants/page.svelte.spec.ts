import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import * as m from '$lib/paraglide/messages';
import type { PageData } from './$types';
import RankingPage from './+page.svelte';

function rankedPlace(placeId: string, name: string, sourceTierIndex: number) {
	return {
		placeId,
		name,
		category: 'restaurant' as const,
		displayLocality: 'Parma',
		addressLabel: `${name} address`,
		commentBody: undefined,
		moveUpEffect: undefined,
		moveDownEffect: undefined,
		canReposition: true,
		canPlaceManually: true,
		sourceTierIndex,
		sourceTierSize: 1
	};
}

const data = {
	openSession: undefined,
	revisionId: 'revision-1',
	adjusted: false,
	projection: { orderCoverage: 'total', nextAction: { type: 'view-ranking' } },
	tiers: ['Alpha', 'Beta', 'Gamma'].map((name, index) => ({
		position: index + 1,
		places: [rankedPlace(`restaurant-${index + 1}`, name, index)]
	})),
	unplaced: [],
	unresolved: [],
	reviewPrompt: undefined
} as unknown as PageData;

describe('manual ranking placement interactions', () => {
	it('keeps list geometry stable in click/tap mode and allows cancellation from the picked card', async () => {
		const screen = await render(RankingPage, { data, form: null });
		const list = document.querySelector<HTMLOListElement>('.ranking-tiers')!;
		const initialHeight = list.getBoundingClientRect().height;

		await screen.getByRole('button', { name: m.ranking_pick_up({ place: 'Beta' }) }).click();

		expect(document.querySelector('.ranking-picked-layer')).not.toBeNull();
		expect(document.querySelectorAll('.ranking-placement-target--active')).toHaveLength(1);
		expect(list.getBoundingClientRect().height).toBe(initialHeight);

		await screen.getByRole('button', { name: m.ranking_cancel_move({ place: 'Beta' }) }).click();
		expect(document.querySelector('.ranking-picked-layer')).toBeNull();
		await screen.getByRole('button', { name: m.ranking_pick_up({ place: 'Alpha' }) }).click();
		expect(document.querySelector('.ranking-picked-layer')).not.toBeNull();
	});

	it('submits a native handle drag through the stable list-level drop surface', async () => {
		const screen = await render(RankingPage, { data, form: null });
		const source = screen.getByRole('button', { name: m.ranking_pick_up({ place: 'Alpha' }) });
		const destination = document.querySelector<HTMLElement>('[data-ranking-tier-index="2"]')!;
		const list = document.querySelector<HTMLOListElement>('.ranking-tiers')!;
		let submitted: Record<string, string> | undefined;
		const intercept = (event: SubmitEvent) => {
			const form = event.target;
			if (!(form instanceof HTMLFormElement) || !form.action.endsWith('?/place')) return;
			event.preventDefault();
			submitted = Object.fromEntries(
				[...new FormData(form).entries()].map(([key, value]) => [key, String(value)])
			);
		};
		document.addEventListener('submit', intercept, { capture: true });

		try {
			expect(source.element().getAttribute('data-ranking-place-id')).toBe('restaurant-1');
			const sourceBounds = source.element().getBoundingClientRect();
			expect(
				document
					.elementFromPoint(
						sourceBounds.x + sourceBounds.width / 2,
						sourceBounds.y + sourceBounds.height / 2
					)
					?.closest('[data-ranking-place-id]')
					?.getAttribute('data-ranking-place-id')
			).toBe('restaurant-1');
			const directTransfer = new DataTransfer();
			source.element().dispatchEvent(
				new DragEvent('dragstart', {
					bubbles: true,
					cancelable: true,
					dataTransfer: directTransfer
				})
			);
			expect(directTransfer.getData('text/plain')).toBe('restaurant-1');
			const destinationBounds = destination.getBoundingClientRect();
			list.dispatchEvent(
				new DragEvent('dragover', {
					bubbles: true,
					cancelable: true,
					clientY: destinationBounds.top + destinationBounds.height / 2,
					dataTransfer: directTransfer
				})
			);
			list.dispatchEvent(
				new DragEvent('drop', {
					bubbles: true,
					cancelable: true,
					dataTransfer: directTransfer
				})
			);
			source.element().dispatchEvent(new DragEvent('dragend', { bubbles: true }));
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			expect(submitted?.placeId).toBe('restaurant-1');
			expect(submitted?.destinationType).toMatch(/^(boundary|tie)$/);
			expect(submitted?.destinationIndex).toMatch(/^\d+$/);
		} finally {
			document.removeEventListener('submit', intercept, { capture: true });
		}
	});
});
