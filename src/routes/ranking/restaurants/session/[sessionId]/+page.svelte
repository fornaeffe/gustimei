<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { Equal, RotateCcw, SkipForward } from '@lucide/svelte';
	import ComparisonPlaceCard from '$lib/components/ranking/ComparisonPlaceCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
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
			<div class="ranking-session__progress">
				<strong
					>{m.comparison_progress({ remaining: data.session.progress.estimatedRemaining })}</strong
				>
				<small>{m.comparison_help()}</small>
			</div>
		</header>
		<a
			class="button button--quiet ranking-session__leave"
			href={resolve(localizeHref('/recommendations/restaurants', { locale }) as Pathname)}
			>{m.leave_ranking()}</a
		>

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
{:else if data.session.lifecycle === 'completed'}
	<StatePanel title={m.ranking_complete_title()} description={m.ranking_publish_retry()}>
		{#snippet action()}
			<form method="POST" action="?/publish">
				<Button type="submit">{m.publish_ranking()}</Button>
			</form>
		{/snippet}
	</StatePanel>
{:else}
	<StatePanel title={m.ranking_ready()} description={m.phase_five_session_ready()} />
{/if}
