<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { ListOrdered, StickyNote, Trash2 } from '@lucide/svelte';
	import PersonalComment from '$lib/components/comments/PersonalComment.svelte';
	import PersonalCommentField from '$lib/components/comments/PersonalCommentField.svelte';
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
</script>

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
		<ol class="ranking-tiers">
			{#each data.tiers as tier (tier.position)}
				<li class="surface-card ranking-tier">
					<span class="ranking-tier__position"
						>{tier.places.length > 1
							? m.ranking_tied_position({ position: tier.position })
							: m.ranking_position({ position: tier.position })}</span
					>
					{#each tier.places as place (place.placeId)}
						<article class="ranked-place">
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
							{#if place.commentBody}<span class="status-chip"
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
