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
	import {
		isPlacementTargetAllowed,
		nearestPlacementTarget,
		type PlacementTarget
	} from '$lib/components/ranking/manual-placement';
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
	type PickupFrame = {
		top: number;
		left: number;
		width: number;
		height: number;
		anchorY: number;
		shift: number;
	};

	let pickedPlace = $state<PickedPlace>();
	let draggedPlace = $state<PickedPlace>();
	let suppressHandleClickUntil = 0;
	let movingPlace = $derived(draggedPlace ?? pickedPlace);
	let placementTarget = $state<PlacementTarget>();
	let placementForm = $state<HTMLFormElement>();
	let rankingList = $state<HTMLOListElement>();
	let pickupFrame = $state<PickupFrame>();
	let pickedClone = $state.raw<HTMLElement>();
	let pickedSourceHandle = $state<HTMLButtonElement>();
	let moveStatus = $state('');
	let submittingMove = $state(false);
	function registerPlacementForm(node: HTMLFormElement) {
		placementForm = node;
		return () => {
			if (placementForm === node) placementForm = undefined;
		};
	}
	function registerRankingList(node: HTMLOListElement) {
		rankingList = node;
		return () => {
			if (rankingList === node) rankingList = undefined;
		};
	}
	function registerPickedClone(node: HTMLElement) {
		const clone = pickedClone?.cloneNode(true);
		if (clone instanceof HTMLElement) {
			clone
				.querySelectorAll<HTMLElement>('[id]')
				.forEach((element) => element.removeAttribute('id'));
			node.replaceChildren(clone);
		}
		return () => node.replaceChildren();
	}
	function registerPickedDropHandle(node: HTMLButtonElement) {
		void tick().then(() => node.focus({ preventScroll: true }));
	}

	function boundaryAllowed(index: number) {
		return Boolean(
			movingPlace && isPlacementTargetAllowed({ type: 'boundary', index }, movingPlace)
		);
	}

	function tieAllowed(index: number) {
		return Boolean(movingPlace && isPlacementTargetAllowed({ type: 'tie', index }, movingPlace));
	}

	function tierGeometry() {
		if (!rankingList) return [];
		return [...rankingList.querySelectorAll<HTMLElement>('[data-ranking-tier-index]')].map(
			(element) => {
				const bounds = element.getBoundingClientRect();
				return {
					index: Number(element.dataset.rankingTierIndex),
					top: bounds.top,
					bottom: bounds.bottom
				};
			}
		);
	}

	function updatePlacementTarget(anchorY: number) {
		if (!movingPlace || submittingMove) return;
		placementTarget = nearestPlacementTarget(tierGeometry(), anchorY, movingPlace);
		if (placementTarget) {
			moveStatus =
				placementTarget.type === 'tie'
					? m.ranking_move_equal_target({
							position: data.tiers[placementTarget.index]?.position ?? placementTarget.index + 1
						})
					: m.ranking_move_target({ position: placementTarget.index + 1 });
		}
	}

	function beginMove(place: PickedPlace, sourceHandle: HTMLButtonElement) {
		if (submittingMove) return;
		const source = sourceHandle.closest<HTMLElement>('.ranked-place');
		if (!source) return;
		const bounds = source.getBoundingClientRect();
		const availableShift = Math.max(0, window.innerWidth - bounds.right - 8);
		pickedClone = source.cloneNode(true) as HTMLElement;
		pickedSourceHandle = sourceHandle;
		pickupFrame = {
			top: bounds.top,
			left: bounds.left,
			width: bounds.width,
			height: bounds.height,
			anchorY: bounds.top + bounds.height / 2,
			shift: Math.min(24, availableShift)
		};
		pickedPlace = place;
		placementTarget = undefined;
		moveStatus = m.ranking_move_picked_up({ place: place.name });
		updatePlacementTarget(pickupFrame.anchorY);
	}

	function cancelMove() {
		const name = pickedPlace?.name;
		const sourceHandle = pickedSourceHandle;
		pickedPlace = undefined;
		placementTarget = undefined;
		pickupFrame = undefined;
		pickedClone = undefined;
		pickedSourceHandle = undefined;
		if (name) moveStatus = m.ranking_move_cancelled({ place: name });
		void tick().then(() => sourceHandle?.focus({ preventScroll: true }));
	}

	function updatePickedTarget() {
		if (pickedPlace && pickupFrame) updatePlacementTarget(pickupFrame.anchorY);
	}

	async function commitMove(target = placementTarget, place = movingPlace) {
		if (!place || !target || submittingMove) return;
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
		if (submittingMove || draggedPlace) {
			event.preventDefault();
			return;
		}
		pickedPlace = undefined;
		pickupFrame = undefined;
		pickedClone = undefined;
		pickedSourceHandle = undefined;
		draggedPlace = place;
		placementTarget = undefined;
		suppressHandleClickUntil = Date.now() + 500;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', place.placeId);
		}
	}

	function dragOver(event: DragEvent) {
		if (!draggedPlace) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		updatePlacementTarget(event.clientY);
	}

	function dropDraggedPlace(event: DragEvent) {
		if (!draggedPlace || !placementTarget) return;
		event.preventDefault();
		void commitMove(placementTarget, draggedPlace);
	}

	function dragEnd() {
		suppressHandleClickUntil = Date.now() + 500;
		if (submittingMove) return;
		draggedPlace = undefined;
		placementTarget = undefined;
	}

	function handleHandleClick(event: MouseEvent, place: PickedPlace) {
		if (event.detail > 0 && Date.now() <= suppressHandleClickUntil) {
			event.preventDefault();
			return;
		}
		const handle = event.currentTarget;
		if (handle instanceof HTMLButtonElement) beginMove(place, handle);
	}

	function resetMoveState() {
		pickedPlace = undefined;
		draggedPlace = undefined;
		placementTarget = undefined;
		pickupFrame = undefined;
		pickedClone = undefined;
		pickedSourceHandle = undefined;
		submittingMove = false;
	}

	const enhancePlacement: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				resetMoveState();
				await goto(resolve(result.location as Pathname), {
					invalidateAll: true,
					noScroll: true
				});
				return;
			}
			if (draggedPlace) {
				draggedPlace = undefined;
				placementTarget = undefined;
			}
			submittingMove = false;
			await update();
		};
	};
</script>

<svelte:window
	onkeydown={handleMoveKeydown}
	onscroll={updatePickedTarget}
	onresize={updatePickedTarget}
/>

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
			<input type="hidden" name="placeId" value={movingPlace?.placeId ?? ''} />
			<input type="hidden" name="revisionId" value={data.revisionId ?? ''} />
			<input type="hidden" name="destinationType" value={placementTarget?.type ?? ''} />
			<input type="hidden" name="destinationIndex" value={placementTarget?.index ?? ''} />
		</form>
		<p class="sr-only" aria-live="polite">{moveStatus}</p>
		<ol
			class="ranking-tiers"
			{@attach registerRankingList}
			ondragover={dragOver}
			ondrop={dropDraggedPlace}
		>
			{#each data.tiers as tier, tierIndex (tier.position)}
				<li class="surface-card ranking-tier" data-ranking-tier-index={tierIndex}>
					<div
						class="ranking-placement-target ranking-placement-target--boundary-top"
						class:ranking-placement-target--active={movingPlace &&
							boundaryAllowed(tierIndex) &&
							placementTarget?.type === 'boundary' &&
							placementTarget.index === tierIndex}
						aria-hidden="true"
					>
						{m.ranking_drop_here()}
					</div>
					<div
						class="ranking-placement-target ranking-placement-target--tie"
						class:ranking-placement-target--active={movingPlace &&
							tieAllowed(tierIndex) &&
							placementTarget?.type === 'tie' &&
							placementTarget.index === tierIndex}
						aria-hidden="true"
					>
						{m.ranking_make_equal_with_tier({ position: tier.position })}
					</div>
					{#if tierIndex === data.tiers.length - 1}
						<div
							class="ranking-placement-target ranking-placement-target--boundary-bottom"
							class:ranking-placement-target--active={movingPlace &&
								boundaryAllowed(data.tiers.length) &&
								placementTarget?.type === 'boundary' &&
								placementTarget.index === data.tiers.length}
							aria-hidden="true"
						>
							{m.ranking_drop_here()}
						</div>
					{/if}
					<span class="ranking-tier__position"
						>{tier.places.length > 1
							? m.ranking_tied_position({ position: tier.position })
							: m.ranking_position({ position: tier.position })}</span
					>
					{#each tier.places as place (place.placeId)}
						<article
							class="ranked-place"
							class:ranked-place--source-placeholder={pickedPlace?.placeId === place.placeId}
							class:ranked-place--dragging={draggedPlace?.placeId === place.placeId}
						>
							<button
								class="ranking-move-handle icon-button"
								data-ranking-place-id={place.placeId}
								type="button"
								draggable={place.canPlaceManually}
								disabled={!place.canPlaceManually}
								aria-pressed={pickedPlace?.placeId === place.placeId}
								aria-label={m.ranking_pick_up({ place: place.name })}
								aria-describedby="ranking-adjustment-help"
								title={m.ranking_pick_up({ place: place.name })}
								onclick={(event) =>
									handleHandleClick(event, {
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
								ondragend={dragEnd}
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
				</li>
			{/each}
		</ol>
		{#if pickedPlace && pickupFrame && pickedClone}
			{#key pickedPlace.placeId}
				<aside
					class="ranking-picked-layer"
					style={`top:${pickupFrame.top}px;left:${pickupFrame.left}px;width:${pickupFrame.width}px;min-height:${pickupFrame.height}px;--ranking-pickup-shift:${pickupFrame.shift}px`}
					aria-label={m.ranking_move_dialog()}
				>
					<div
						class="ranking-picked-layer__clone"
						aria-hidden="true"
						inert
						{@attach registerPickedClone}
					></div>
					<button
						class="ranking-move-handle icon-button ranking-picked-layer__handle"
						type="button"
						disabled={!placementTarget || submittingMove}
						aria-label={m.ranking_place_here({ place: pickedPlace.name })}
						title={m.ranking_place_here({ place: pickedPlace.name })}
						{@attach registerPickedDropHandle}
						onclick={() => void commitMove()}
					>
						<Icon icon={GripVertical} />
					</button>
					<button
						class="icon-button ranking-picked-layer__cancel"
						type="button"
						aria-label={m.ranking_cancel_move({ place: pickedPlace.name })}
						title={m.ranking_cancel_move({ place: pickedPlace.name })}
						onclick={cancelMove}><Icon icon={X} /></button
					>
				</aside>
			{/key}
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
