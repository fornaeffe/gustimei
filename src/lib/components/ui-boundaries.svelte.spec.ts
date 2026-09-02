import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import * as m from '$lib/paraglide/messages';
import PersonalCommentField from './comments/PersonalCommentField.svelte';
import ComparisonPlaceCard from './ranking/ComparisonPlaceCard.svelte';
import RankingPlaceActions from './ranking/RankingPlaceActions.svelte';
import ReviewDisclosure from './reviews/ReviewDisclosure.svelte';
import NoticeForm from './reviews/NoticeForm.svelte';
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
		await expect.element(screen.getByText(m.visited())).toBeVisible();
	});

	it('labels the private note purpose and updates its accessible explicit-save counter', async () => {
		const screen = await render(PersonalCommentField, { value: '', maxLength: 20 });
		const note = screen.getByRole('textbox', { name: m.private_note_label() });
		await note.fill('Quiet table');
		await expect.element(screen.getByText(m.characters_remaining({ count: 9 }))).toBeVisible();
		await expect.element(screen.getByText(m.private_note_explanation())).toBeVisible();
		await expect.element(screen.getByRole('button', { name: m.save_note() })).toBeVisible();
	});

	it('identifies public review content and its verification limitation', async () => {
		const screen = await render(ReviewDisclosure);
		await expect.element(screen.getByText(m.public_review_title())).toBeVisible();
		await expect.element(screen.getByText(m.public_review_explanation())).toBeVisible();
	});

	it('matches notice explanation limits and makes evidence explicitly optional', async () => {
		const screen = await render(NoticeForm, { versionId: 'version-1' });
		const explanation = screen.getByRole('textbox', { name: m.notice_explanation() });
		await expect.element(explanation).toHaveAttribute('minlength', '20');
		await expect.element(explanation).toHaveAttribute('maxlength', '5000');
		await expect.element(screen.getByText(m.evidence_optional_file_help())).toBeVisible();
	});

	it('offers a balanced explicit comparison choice with a collapsed owner-only note', async () => {
		const screen = await render(ComparisonPlaceCard, {
			place: {
				name: 'Trattoria Verde',
				category: 'restaurant',
				displayLocality: 'Parma',
				addressLabel: 'Via Verde 1',
				commentBody: 'Quiet table by the window'
			},
			comparisonId: 'comparison-1',
			outcome: 'left'
		});
		await expect
			.element(screen.getByRole('button', { name: m.prefer_place({ place: 'Trattoria Verde' }) }))
			.toBeVisible();
		await expect.element(screen.getByText('Parma')).toBeVisible();
		await expect.element(screen.getByText(m.view_private_note())).toBeVisible();
		await expect.element(screen.getByText('Quiet table by the window')).not.toBeVisible();
	});

	it('exposes compact ranking adjustments with complete accessible meanings', async () => {
		const screen = await render(RankingPlaceActions, {
			placeId: 'restaurant-1',
			placeName: 'Trattoria Verde',
			revisionId: 'revision-1',
			moveUpEffect: 'merge',
			moveDownEffect: 'split',
			canReposition: true,
			adjustAction: '?/adjust',
			repositionAction: '?/reposition',
			describedBy: 'ranking-help'
		});

		await expect
			.element(
				screen.getByRole('button', {
					name: m.move_up_merge({ place: 'Trattoria Verde' })
				})
			)
			.toBeEnabled();
		await expect
			.element(
				screen.getByRole('button', {
					name: m.move_down_split({ place: 'Trattoria Verde' })
				})
			)
			.toBeEnabled();
		await expect
			.element(screen.getByRole('button', { name: m.rerank_place({ place: 'Trattoria Verde' }) }))
			.toBeEnabled();
	});
});
