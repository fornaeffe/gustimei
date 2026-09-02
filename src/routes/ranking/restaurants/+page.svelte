<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { GripVertical, ListOrdered, StickyNote, Trash2, X } from '@lucide/svelte';
	import { tick } from 'svelte';
	import PersonalComment from '$lib/components/comments/PersonalComment.svelte';
	import PersonalCommentField from '$lib/components/comments/PersonalCommentField.svelte';
	import RankingPlaceActions from '$lib/components/ranking/RankingPlaceActions.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
	let locale = $derived(getLocale());
	let hasUsefulWork = $derived(
		Boolean(data.openSession) ||
			data.unplaced.length > 0 ||
			['repair', 'continue-ranking'].includes(data.projection?.nextAction.type ?? '')
	);
	type PickedPlace = {
		placeId: string;
		name: string;
		sourceTierIndex: number;
		sourceTierSize: number;
	};
	type PlacementTarget = { type: 'boundary' | 'tie'; index: number };

	let pickedPlace = $state<PickedPlace>();
	let placementTarget = $state<PlacementTarget>();
	let placementForm = $state<HTMLFormElement>();
	let moveStatus = $state('');
	let submittingMove = $state(false);
	function registerPlacementForm(node: HTMLFormElement) {
		placementForm = node;
		return () => {
			if (placementForm === node) placementForm = undefined;
		};
	}

	function boundaryAllowed(index: number) {
		if (!pickedPlace) return false;
		return !(
			pickedPlace.sourceTierSize === 1 &&
			(index === pickedPlace.sourceTierIndex || index === pickedPlace.sourceTierIndex + 1)
		);
	}

	function tieAllowed(index: number) {
		return Boolean(pickedPlace && index !== pickedPlace.sourceTierIndex);
	}

	function beginMove(place: PickedPlace) {
		if (submittingMove) return;
		pickedPlace = place;
		placementTarget = undefined;
		moveStatus = m.ranking_move_picked_up({ place: place.name });
		void tick().then(updateNearestBoundary);
	}

	function cancelMove() {
		const name = pickedPlace?.name;
		pickedPlace = undefined;
		placementTarget = undefined;
		if (name) moveStatus = m.ranking_move_cancelled({ place: name });
	}

	function updateNearestBoundary() {
		if (!pickedPlace || submittingMove) return;
		const candidates = [...document.querySelectorAll<HTMLElement>('[data-placement-boundary]')]
			.map((element) => ({
				element,
				index: Number(element.dataset.placementBoundary)
			}))
			.filter((candidate) => boundaryAllowed(candidate.index));
		if (candidates.length === 0) return;
		const center = window.innerHeight / 2;
		const nearest = candidates.reduce((best, candidate) => {
			const distance = Math.abs(candidate.element.getBoundingClientRect().top - center);
			const bestDistance = Math.abs(best.element.getBoundingClientRect().top - center);
			return distance < bestDistance ? candidate : best;
		});
		placementTarget = { type: 'boundary', index: nearest.index };
	}

	async function commitMove(target = placementTarget) {
		if (!pickedPlace || !target || submittingMove) return;
		if (target.type === 'boundary' ? !boundaryAllowed(target.index) : !tieAllowed(target.index)) {
			return;
		}
		placementTarget = target;
		submittingMove = true;
		await tick();
		placementForm?.requestSubmit();
	}

	function handleMoveKeydown(event: KeyboardEvent) {
		if (!pickedPlace) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			cancelMove();
			return;
		}
		const target = event.target instanceof HTMLElement ? event.target : undefined;
		if (
			target?.matches('button, a, input, textarea, select, summary') &&
			!target.classList.contains('ranking-move-handle')
		) {
			return;
		}
		const boundaries = Array.from({ length: data.tiers.length + 1 }, (_, index) => index).filter(
			boundaryAllowed
		);
		if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
			event.preventDefault();
			const current =
				placementTarget?.type === 'boundary'
					? Math.max(0, boundaries.indexOf(placementTarget.index))
					: 0;
			const next =
				event.key === 'Home'
					? 0
					: event.key === 'End'
						? boundaries.length - 1
						: event.key === 'ArrowUp'
							? Math.max(0, current - 1)
							: Math.min(boundaries.length - 1, current + 1);
			placementTarget = { type: 'boundary', index: boundaries[next] };
			moveStatus = m.ranking_move_target({ position: boundaries[next] + 1 });
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			void commitMove();
		}
	}

	function dragStart(event: DragEvent, place: PickedPlace) {
		beginMove(place);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', place.placeId);
		}
	}

	const enhancePlacement: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				await goto(resolve(result.location as Pathname), {
					invalidateAll: true,
					noScroll: true
				});
				return;
			}
			submittingMove = false;
			await update();
		};
	};
</script>

<svelte:window onkeydown={handleMoveKeydown} onscroll={updateNearestBoundary} />

<svelte:head><title>{m.my_ranking_title()} — {m.product_name()}</title></svelte:head>

<section class="personal-ranking stack" aria-labelledby="ranking-title">
	<header class="personal-ranking__header">
		<div>
			<p class="eyebrow"><Icon icon={ListOrdered} size={16} />{m.nav_ranking()}</p>
			<h1 id="ranking-title">{m.my_ranking_title()}</h1>
			<p class="lede">{m.my_ranking_intro()}</p>
		</div>
		{#if hasUsefulWork}
			<form method="POST" action="?/start">
				<Button type="submit">{data.openSession ? m.ranking_continue() : m.ranking_update()}</Button
				>
			</form>
		{/if}
	</header>

	{#if form?.error}<p class="form-status form-status--error" role="alert">{form.error}</p>{/if}

	{#if data.tiers.length === 0}
		<StatePanel title={m.ranking_empty()} description={m.ranking_empty_body()}>
			{#snippet action()}<Button href={localizeHref('/recommendations/restaurants', { locale })}
					>{m.nav_discover()}</Button
				>{/snippet}
		</StatePanel>
	{:else}
		<p id="ranking-adjustment-help" class="ranking-adjustment-help">
			{m.ranking_manual_move_help()}
		</p>
		{#if data.adjusted}
			<p class="form-status form-status--success" role="status">{m.ranking_adjustment_success()}</p>
		{/if}
		<form
			hidden
			method="POST"
			action="?/place"
			{@attach registerPlacementForm}
			use:enhance={enhancePlacement}
		>
			<input type="hidden" name="placeId" value={pickedPlace?.placeId ?? ''} />
			<input type="hidden" name="revisionId" value={data.revisionId ?? ''} />
			<input type="hidden" name="destinationType" value={placementTarget?.type ?? ''} />
			<input type="hidden" name="destinationIndex" value={placementTarget?.index ?? ''} />
		</form>
		<p class="sr-only" aria-live="polite">{moveStatus}</p>
		<ol class="ranking-tiers" class:ranking-tiers--moving={pickedPlace}>
			{#each data.tiers as tier, tierIndex (tier.position)}
				{#if pickedPlace && boundaryAllowed(tierIndex)}
					<li class="ranking-drop-boundary">
						<button
							type="button"
							data-placement-boundary={tierIndex}
							class:ranking-drop-boundary__button--active={placementTarget?.type === 'boundary' &&
								placementTarget.index === tierIndex}
							onpointerenter={() => (placementTarget = { type: 'boundary', index: tierIndex })}
							onfocus={() => (placementTarget = { type: 'boundary', index: tierIndex })}
							ondragover={(event) => event.preventDefault()}
							ondrop={(event) => {
								event.preventDefault();
								void commitMove({ type: 'boundary', index: tierIndex });
							}}
							onclick={() => (placementTarget = { type: 'boundary', index: tierIndex })}
						>
							{m.ranking_drop_here()}
						</button>
					</li>
				{/if}
				<li class="surface-card ranking-tier">
					<span class="ranking-tier__position"
						>{tier.places.length > 1
							? m.ranking_tied_position({ position: tier.position })
							: m.ranking_position({ position: tier.position })}</span
					>
					{#each tier.places as place (place.placeId)}
						<article
							class="ranked-place"
							class:ranked-place--picked={pickedPlace?.placeId === place.placeId}
						>
							<button
								class="ranking-move-handle icon-button"
								type="button"
								draggable={place.canPlaceManually}
								disabled={!place.canPlaceManually}
								aria-pressed={pickedPlace?.placeId === place.placeId}
								aria-label={m.ranking_pick_up({ place: place.name })}
								aria-describedby="ranking-adjustment-help"
								title={m.ranking_pick_up({ place: place.name })}
								onclick={() =>
									beginMove({
										placeId: place.placeId,
										name: place.name,
										sourceTierIndex: place.sourceTierIndex,
										sourceTierSize: place.sourceTierSize
									})}
								ondragstart={(event) =>
									dragStart(event, {
										placeId: place.placeId,
										name: place.name,
										sourceTierIndex: place.sourceTierIndex,
										sourceTierSize: place.sourceTierSize
									})}
							>
								<Icon icon={GripVertical} />
							</button>
							<div>
								<h2>
									<a
										href={resolve(
											localizeHref(`/places/${encodeURIComponent(place.placeId)}`, {
												locale
											}) as Pathname
										)}>{place.name}</a
									>
								</h2>
								<p>{place.addressLabel || place.displayLocality}</p>
							</div>
							<RankingPlaceActions
								placeId={place.placeId}
								placeName={place.name}
								revisionId={data.revisionId ?? ''}
								moveUpEffect={place.moveUpEffect}
								moveDownEffect={place.moveDownEffect}
								canReposition={place.canReposition}
								adjustAction="?/adjust"
								repositionAction="?/reposition"
								describedBy="ranking-adjustment-help"
							/>
							{#if place.commentBody}<span class="status-chip ranked-place__note-status"
									><Icon icon={StickyNote} size={14} />{m.private_note_available()}</span
								>{/if}
							<details>
								<summary>{m.private_note_title()}</summary>
								{#if place.commentBody}<PersonalComment body={place.commentBody} />{/if}
								<PersonalCommentField
									value={place.commentBody ?? ''}
									placeId={place.placeId}
									fieldId={`ranking-comment-${place.placeId.replaceAll(':', '-')}`}
								/>
								<form
									method="POST"
									action="?/removePlace"
									onsubmit={(event) => {
										if (!confirm(m.remove_ranked_place_confirm())) event.preventDefault();
									}}
								>
									<input type="hidden" name="placeId" value={place.placeId} />
									<Button type="submit" variant="danger">{m.remove_ranked_place()}</Button>
								</form>
							</details>
						</article>
					{/each}
					{#if pickedPlace && tieAllowed(tierIndex)}
						<button
							class="ranking-tie-target"
							class:ranking-tie-target--active={placementTarget?.type === 'tie' &&
								placementTarget.index === tierIndex}
							type="button"
							onclick={() => (placementTarget = { type: 'tie', index: tierIndex })}
							onfocus={() => (placementTarget = { type: 'tie', index: tierIndex })}
							ondragover={(event) => event.preventDefault()}
							ondrop={(event) => {
								event.preventDefault();
								void commitMove({ type: 'tie', index: tierIndex });
							}}
						>
							{m.ranking_make_equal_with_tier({ position: tier.position })}
						</button>
					{/if}
				</li>
			{/each}
			{#if pickedPlace && boundaryAllowed(data.tiers.length)}
				<li class="ranking-drop-boundary">
					<button
						type="button"
						data-placement-boundary={data.tiers.length}
						class:ranking-drop-boundary__button--active={placementTarget?.type === 'boundary' &&
							placementTarget.index === data.tiers.length}
						onpointerenter={() =>
							(placementTarget = { type: 'boundary', index: data.tiers.length })}
						onfocus={() => (placementTarget = { type: 'boundary', index: data.tiers.length })}
						ondragover={(event) => event.preventDefault()}
						ondrop={(event) => {
							event.preventDefault();
							void commitMove({ type: 'boundary', index: data.tiers.length });
						}}
						onclick={() => (placementTarget = { type: 'boundary', index: data.tiers.length })}
					>
						{m.ranking_drop_here()}
					</button>
				</li>
			{/if}
		</ol>
		{#if pickedPlace}
			<aside class="surface-card ranking-floating-move" aria-label={m.ranking_move_dialog()}>
				<button
					class="ranking-floating-move__handle"
					type="button"
					disabled={!placementTarget || submittingMove}
					onclick={() => void commitMove()}
				>
					<Icon icon={GripVertical} />
					<span>{m.ranking_place_here({ place: pickedPlace.name })}</span>
				</button>
				<button
					class="icon-button"
					type="button"
					aria-label={m.ranking_cancel_move({ place: pickedPlace.name })}
					title={m.ranking_cancel_move({ place: pickedPlace.name })}
					onclick={cancelMove}><Icon icon={X} /></button
				>
			</aside>
		{/if}
	{/if}

	{#if data.reviewPrompt && form?.section !== 'reviewPrompt'}
		<aside class="surface-card review-prompt" aria-labelledby="review-prompt-title">
			<div>
				<h2 id="review-prompt-title">{m.optional_review_prompt()}</h2>
				<p>{m.optional_review_prompt_body()}</p>
			</div>
			<div class="cluster">
				<Button
					href={localizeHref(
						`/places/${encodeURIComponent(data.reviewPrompt.placeId)}/reviews/new?returnTo=${encodeURIComponent('/ranking/restaurants')}`,
						{ locale }
					)}
				>
					{m.review_this_place({ place: data.reviewPrompt.name })}
				</Button>
				<form method="POST" action="?/dismissReviewPrompt" use:enhance>
					<Button type="submit" variant="quiet">{m.not_now()}</Button>
				</form>
			</div>
		</aside>
	{/if}

	{#if data.unplaced.length > 0 || data.unresolved.length > 0}
		<section class="surface-card unresolved-ranking" aria-labelledby="unplaced-title">
			<h2 id="unplaced-title">{m.not_placed_yet()}</h2>
			<p>{m.not_placed_yet_body()}</p>
			<ul class="unplaced-list">
				{#each [...data.unplaced, ...data.unresolved] as place (place.placeId)}
					<li>
						<a
							href={resolve(
								localizeHref(`/places/${encodeURIComponent(place.placeId)}`, { locale }) as Pathname
							)}>{place.name}</a
						><span>{place.addressLabel || place.displayLocality}</span>
					</li>
				{/each}
			</ul>
		</section>
	{:else if data.tiers.length > 0}
		<StatePanel title={m.ranking_up_to_date()} description={m.ranking_up_to_date_body()} />
	{/if}

	{#if data.tiers.length > 0 && !hasUsefulWork}
		<details class="surface-card ranking-maintenance">
			<summary>{m.rerank_entire_list()}</summary>
			<p>{m.rerank_entire_list_body()}</p>
			<form method="POST" action="?/rebuild">
				<Button type="submit" variant="secondary">{m.rerank_entire_list()}</Button>
			</form>
			<hr />
			<p>{m.delete_ranking_body()}</p>
			<form
				method="POST"
				action="?/deleteCategory"
				use:enhance
				onsubmit={(event) => {
					if (!confirm(m.delete_ranking_confirm())) event.preventDefault();
				}}
			>
				<Button type="submit" variant="danger"
					><Icon icon={Trash2} size={17} />{m.delete_ranking()}</Button
				>
			</form>
		</details>
	{/if}
</section>
