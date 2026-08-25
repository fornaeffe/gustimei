<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { navigating } from '$app/state';
	import type { Pathname } from '$app/types';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { Search, Trash2 } from '@lucide/svelte';
	import PersonalComment from '$lib/components/comments/PersonalComment.svelte';
	import PersonalCommentField from '$lib/components/comments/PersonalCommentField.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PlaceCard from '$lib/components/ui/PlaceCard.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
	let locale = $derived(getLocale());
	let debounceTimer: ReturnType<typeof setTimeout>;
	let searchPending = $derived(
		Boolean(navigating.to?.url.pathname.includes('/ranking/restaurants'))
	);

	function debounceSearch(event: Event) {
		const form = (event.currentTarget as HTMLInputElement).form;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => form?.requestSubmit(), 400);
	}
</script>

<svelte:head><title>{m.selection_title()} — {m.product_name()}</title></svelte:head>

<div class="selection-layout">
	<section class="stack" aria-labelledby="selection-title">
		<header>
			<p class="eyebrow">{m.dashboard_primary_title()}</p>
			<h1 id="selection-title">{m.selection_title()}</h1>
			<p class="lede">{m.selection_intro()}</p>
		</header>

		<form method="GET" class="surface-card catalogue-search">
			<div class="field">
				<label for="restaurant-query">{m.restaurant_name()}</label>
				<input
					id="restaurant-query"
					name="q"
					value={data.query.name}
					oninput={debounceSearch}
					autocomplete="off"
				/>
			</div>
			<div class="field">
				<label for="locality-query">{m.locality_filter()}</label>
				<input
					id="locality-query"
					name="locality"
					value={data.query.locality}
					oninput={debounceSearch}
					autocomplete="address-level2"
					aria-describedby="locality-help"
				/>
				<p id="locality-help" class="field__hint">{m.locality_filter_help()}</p>
			</div>
			<Button type="submit"><Icon icon={Search} size={18} />{m.search_action()}</Button>
		</form>

		<div aria-live="polite" aria-busy={searchPending}>
			{#if searchPending}
				<StatePanel title={m.search_loading()} description={m.search_prompt()} />
			{:else if !data.query.name && !data.query.locality}
				<StatePanel title={m.search_restaurants()} description={m.search_prompt()} />
			{:else if data.results.length === 0}
				<StatePanel title={m.search_empty()} description={m.search_empty_body()} />
			{:else}
				<div class="place-grid">
					{#each data.results as place (place.placeId)}
						<div class="place-result">
							<PlaceCard
								name={place.name}
								category="restaurant"
								locality={place.displayLocality}
								visited={place.selected}
								href={localizeHref(`/places/${encodeURIComponent(place.placeId)}`, { locale })}
							/>
							{#if place.selected}
								<span class="button button--quiet" aria-disabled="true">{m.already_selected()}</span
								>
							{:else}
								<form method="POST" action="?/add" use:enhance>
									<input type="hidden" name="placeId" value={place.placeId} />
									<Button type="submit">{m.add_visited_place()}</Button>
								</form>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
		<p class="attribution">
			<a href="https://www.openstreetmap.org/copyright" rel="external"
				>{m.catalogue_attribution()}</a
			>
		</p>
	</section>

	<aside class="selection-bucket stack" aria-labelledby="selected-title">
		<header>
			<h2 id="selected-title">{m.selected_places()}</h2>
			<span class="status-chip">{m.selected_count({ count: data.selected.length })}</span>
		</header>
		{#if form?.error}
			<p class="form-status form-status--error" role="alert">{form.error}</p>
		{/if}
		{#if form?.deleted}
			<p class="form-status" role="status">{m.ranking_deleted()}</p>
		{/if}
		{#if data.selected.length === 0}
			<StatePanel
				title={m.dashboard_empty_ranking()}
				description={m.dashboard_empty_ranking_body()}
			/>
		{:else}
			<div class="selected-list">
				{#each data.selected as place (place.placeId)}
					<article class="surface-card selected-place">
						<header>
							<div>
								<h3>
									<a
										href={resolve(
											localizeHref(`/places/${encodeURIComponent(place.placeId)}`, {
												locale
											}) as Pathname
										)}>{place.name}</a
									>
								</h3>
								<p>{place.displayLocality}</p>
							</div>
							<form
								method="POST"
								action="?/remove"
								use:enhance
								onsubmit={(event) => {
									if (!confirm(m.remove_place_confirm())) event.preventDefault();
								}}
							>
								<input type="hidden" name="placeId" value={place.placeId} />
								<Button type="submit" variant="quiet" ariaLabel={m.remove_visited_place()}>
									<Icon icon={Trash2} size={17} />
								</Button>
							</form>
						</header>
						{#if place.commentBody}
							<PersonalComment body={place.commentBody} />
							<form method="POST" action="?/deleteComment" use:enhance>
								<input type="hidden" name="placeId" value={place.placeId} />
								<Button type="submit" variant="quiet">{m.delete_private_note()}</Button>
							</form>
						{/if}
						<details>
							<summary>{place.commentBody ? m.save_note() : m.private_note_title()}</summary>
							<PersonalCommentField
								value={place.commentBody ?? ''}
								placeId={place.placeId}
								fieldId={`comment-${place.placeId.replaceAll(':', '-')}`}
							/>
						</details>
					</article>
				{/each}
			</div>
		{/if}

		<div class="surface-card ranking-cta">
			<h2>
				{data.openSession
					? m.resume_ranking()
					: data.selected.length >= 2
						? m.ranking_ready()
						: m.start_ranking()}
			</h2>
			<p>
				{data.openSession
					? m.resume_ranking_body({
							remaining: data.openSession.progress.estimatedRemaining
						})
					: data.selected.length >= 2
						? m.ranking_ready_body()
						: m.ranking_not_ready()}
			</p>
			<form method="POST" action="?/start">
				<Button type="submit" disabled={data.selected.length < 2}>
					{data.openSession ? m.resume_ranking() : m.start_ranking()}
				</Button>
			</form>
			{#if data.list?.projection?.nextAction.type === 'repair'}
				<p>{m.repair_ranking_body()}</p>
				<form method="POST" action="?/repair">
					<Button type="submit" variant="secondary">{m.repair_ranking()}</Button>
				</form>
			{/if}
		</div>

		{#if data.list?.currentRevisionId}
			<div class="surface-card stack">
				<h2>{m.rebuild_ranking()}</h2>
				<p>{m.rebuild_ranking_body()}</p>
				<form method="POST" action="?/start">
					<Button type="submit" variant="secondary">{m.rebuild_ranking()}</Button>
				</form>
				<p>{m.delete_ranking_body()}</p>
				<form
					method="POST"
					action="?/deleteCategory"
					onsubmit={(event) => {
						if (!confirm(m.delete_ranking_confirm())) event.preventDefault();
					}}
				>
					<Button type="submit" variant="danger">{m.delete_ranking()}</Button>
				</form>
			</div>
		{/if}
	</aside>
</div>
