<script lang="ts">
	import { enhance } from '$app/forms';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { Check, Equal, RotateCcw, SkipForward, StickyNote } from '@lucide/svelte';
	import PersonalComment from '$lib/components/comments/PersonalComment.svelte';
	import PersonalCommentField from '$lib/components/comments/PersonalCommentField.svelte';
	import ComparisonPlaceCard from '$lib/components/ranking/ComparisonPlaceCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
	let locale = $derived(getLocale());
	let busy = $state(false);
	let pointerStart = $state<{ x: number; y: number }>();

	function enhanceSubmission() {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	}

	function submit(formId: string | undefined) {
		if (!busy && formId) {
			(document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (busy || event.repeat || !data.comparison) return;
		if ((event.target as HTMLElement)?.closest('input, textarea, button, a, summary')) return;
		const key = event.key.toLowerCase();
		const target =
			key === 'arrowleft' || key === '1'
				? 'comparison-left'
				: key === 'arrowright' || key === '2'
					? 'comparison-right'
					: key === 't'
						? 'comparison-tie'
						: key === 's'
							? 'comparison-skip'
							: key === 'u'
								? 'comparison-undo'
								: undefined;
		if (target) {
			event.preventDefault();
			submit(target);
		}
	}

	function finishSwipe(event: PointerEvent) {
		if (!pointerStart || busy) return;
		const horizontal = event.clientX - pointerStart.x;
		const vertical = Math.abs(event.clientY - pointerStart.y);
		pointerStart = undefined;
		if (Math.abs(horizontal) < 90 || vertical > 60) return;
		submit(horizontal < 0 ? 'comparison-left' : 'comparison-right');
	}
</script>

<svelte:head><title>{m.comparison_title()} — {m.product_name()}</title></svelte:head>
<svelte:window onkeydown={handleKeydown} />

{#if data.session.lifecycle === 'superseded'}
	<StatePanel title={m.session_superseded()} description={m.session_superseded_body()}>
		{#snippet action()}
			<Button href={localizeHref('/ranking/restaurants', { locale })}>
				{m.back_to_visited_places()}
			</Button>
		{/snippet}
	</StatePanel>
{:else if data.comparison?.left && data.comparison.right}
	<section class="ranking-session" aria-labelledby="comparison-title">
		<header class="ranking-session__header">
			<div>
				<p class="eyebrow">{m.start_ranking()}</p>
				<h1 id="comparison-title">{m.comparison_prompt()}</h1>
				<p class="lede">{m.comparison_help()}</p>
			</div>
			<ProgressBar
				value={data.session.progress.fraction * 100}
				label={m.comparison_progress({ remaining: data.session.progress.estimatedRemaining })}
			/>
		</header>

		{#if form?.error}
			<p class="form-status form-status--error" role="alert">{form.error}</p>
		{/if}
		<p class="sr-only" aria-live="polite">
			{busy ? m.saving_comparison() : form?.section === 'comparison' ? m.comparison_saved() : ''}
		</p>

		<div
			class="comparison-arena"
			class:comparison-arena--busy={busy}
			role="group"
			aria-label={m.comparison_prompt()}
			onpointerdown={(event) => (pointerStart = { x: event.clientX, y: event.clientY })}
			onpointerup={finishSwipe}
			onpointercancel={() => (pointerStart = undefined)}
		>
			<ComparisonPlaceCard
				place={data.comparison.left}
				comparisonId={data.comparison.id}
				outcome="left"
				disabled={busy}
				onpending={() => (busy = true)}
				onsettled={() => (busy = false)}
			/>
			<div class="comparison-arena__versus" aria-hidden="true">{m.comparison_or()}</div>
			<ComparisonPlaceCard
				place={data.comparison.right}
				comparisonId={data.comparison.id}
				outcome="right"
				disabled={busy}
				onpending={() => (busy = true)}
				onsettled={() => (busy = false)}
			/>
		</div>

		<div class="comparison-controls" aria-label={m.comparison_help()}>
			<form id="comparison-left" method="POST" action="?/submit" use:enhance={enhanceSubmission}>
				<input type="hidden" name="comparisonId" value={data.comparison.id} />
				<input type="hidden" name="outcome" value="left" />
				<Button type="submit" variant="secondary" disabled={busy}>
					{m.prefer_place({ place: data.comparison.left.name })}
				</Button>
			</form>
			<form id="comparison-tie" method="POST" action="?/submit" use:enhance={enhanceSubmission}>
				<input type="hidden" name="comparisonId" value={data.comparison.id} />
				<input type="hidden" name="outcome" value="tie" />
				<Button type="submit" variant="secondary" disabled={busy}>
					<Icon icon={Equal} size={18} />{m.tie_places()}
				</Button>
			</form>
			<form id="comparison-right" method="POST" action="?/submit" use:enhance={enhanceSubmission}>
				<input type="hidden" name="comparisonId" value={data.comparison.id} />
				<input type="hidden" name="outcome" value="right" />
				<Button type="submit" variant="secondary" disabled={busy}>
					{m.prefer_place({ place: data.comparison.right.name })}
				</Button>
			</form>
		</div>
		<div class="comparison-secondary-controls">
			<form id="comparison-skip" method="POST" action="?/submit" use:enhance={enhanceSubmission}>
				<input type="hidden" name="comparisonId" value={data.comparison.id} />
				<input type="hidden" name="outcome" value="skip" />
				<Button type="submit" variant="quiet" disabled={busy}>
					<Icon icon={SkipForward} size={18} />{m.skip_comparison()}
				</Button>
			</form>
			{#if data.latestEvidenceId}
				<form id="comparison-undo" method="POST" action="?/undo" use:enhance={enhanceSubmission}>
					<input type="hidden" name="evidenceId" value={data.latestEvidenceId} />
					<Button type="submit" variant="quiet" disabled={busy}>
						<Icon icon={RotateCcw} size={18} />{m.undo_comparison()}
					</Button>
				</form>
			{/if}
		</div>
		<p class="keyboard-help">{m.keyboard_shortcuts()}</p>
	</section>
{:else if data.session.lifecycle === 'completed' && !data.ranking}
	<StatePanel title={m.ranking_complete_title()} description={m.ranking_publish_retry()}>
		{#snippet action()}
			<form method="POST" action="?/publish">
				<Button type="submit">{m.publish_ranking()}</Button>
			</form>
		{/snippet}
	</StatePanel>
{:else if data.ranking}
	<section class="completed-ranking stack" aria-labelledby="ranking-title">
		<header>
			<p class="eyebrow"><Icon icon={Check} size={16} />{m.comparison_progress_complete()}</p>
			<h1 id="ranking-title">{m.ranking_complete_title()}</h1>
			<p class="lede">{m.ranking_complete_body()}</p>
		</header>
		{#if form?.section === 'maintenance' && form.error}
			<p class="form-status form-status--error" role="alert">{form.error}</p>
		{/if}
		<form method="GET" class="surface-card cluster">
			<label for="ranking-locality">{m.locality_filter()}</label>
			<input
				id="ranking-locality"
				name="locality"
				value={data.localityFilter}
				autocomplete="address-level2"
			/>
			<Button type="submit" variant="secondary">{m.search_action()}</Button>
		</form>
		{#if data.localityFilter}<p class="field__hint">{m.filtered_ranking_help()}</p>{/if}

		<ol class="ranking-tiers">
			{#each data.ranking.tiers as tier (tier.position)}
				<li class="surface-card ranking-tier">
					<span class="ranking-tier__position">
						{data.localityFilter
							? m.filtered_position({ position: tier.position })
							: tier.places.length > 1
								? m.ranking_tied_position({ position: tier.position })
								: m.ranking_position({ position: tier.position })}
					</span>
					{#each tier.places as place (place.placeId)}
						<article class="ranked-place">
							<div>
								<h2>{place.name}</h2>
								<p>{place.displayLocality}</p>
							</div>
							{#if place.commentBody}
								<span class="status-chip"
									><Icon icon={StickyNote} size={14} />{m.private_note_available()}</span
								>
							{/if}
							<details>
								<summary>{m.private_note_title()}</summary>
								{#if place.commentBody}
									<PersonalComment body={place.commentBody} />
									<form method="POST" action="?/deleteComment" use:enhance>
										<input type="hidden" name="placeId" value={place.placeId} />
										<Button type="submit" variant="quiet">{m.delete_private_note()}</Button>
									</form>
								{/if}
								<PersonalCommentField
									value={place.commentBody ?? ''}
									placeId={place.placeId}
									fieldId={`ranking-comment-${place.placeId.replaceAll(':', '-')}`}
								/>
							</details>
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
						</article>
					{/each}
				</li>
			{/each}
		</ol>

		{#if data.ranking.unresolvedGroups.length > 0}
			<section class="surface-card unresolved-ranking" aria-labelledby="unresolved-title">
				<h2 id="unresolved-title">{m.unresolved_places()}</h2>
				<p>{m.unresolved_places_body()}</p>
				{#each data.ranking.unresolvedGroups as group, index (index)}
					<ul>
						{#each group as place (place.placeId)}<li>
								{place.name} — {place.displayLocality}
							</li>{/each}
					</ul>
				{/each}
			</section>
		{/if}

		{#if data.ranking.answers.length > 0}
			<details class="surface-card">
				<summary>{m.reconsider_answer()}</summary>
				<div class="stack">
					{#each data.ranking.answers as answer (answer.id)}
						<form method="POST" action="?/reconsider" class="cluster">
							<input type="hidden" name="evidenceId" value={answer.id} />
							<span>{answer.leftName} / {answer.rightName}</span>
							<Button type="submit" variant="quiet">{m.reconsider_answer()}</Button>
						</form>
					{/each}
				</div>
			</details>
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
							`/places/${encodeURIComponent(data.reviewPrompt.placeId)}/reviews/new?returnTo=${encodeURIComponent(`/ranking/restaurants/session/${data.session.id}`)}`,
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

		<Button href={localizeHref('/ranking/restaurants', { locale })} variant="secondary">
			{m.back_to_visited_places()}
		</Button>
	</section>
{:else}
	<StatePanel title={m.ranking_ready()} description={m.phase_five_session_ready()} />
{/if}
