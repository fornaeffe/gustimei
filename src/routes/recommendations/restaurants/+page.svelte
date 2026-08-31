<script lang="ts">
	import { onMount } from 'svelte';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { ArrowRight, Compass, Search } from '@lucide/svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PlaceCard from '$lib/components/ui/PlaceCard.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
	let locale = $derived(getLocale());

	onMount(() => {
		const placeIds = data.page.results
			.filter((place) => !place.visited)
			.map((place) => place.placeId);
		if (placeIds.length === 0) return;
		const exposure = new FormData();
		exposure.set('artifactId', data.page.artifactId);
		for (const placeId of placeIds) exposure.append('placeId', placeId);
		void fetch('?/exposed', { method: 'POST', body: exposure });
	});
</script>

<svelte:head><title>{m.recommendations_title()} — {m.product_name()}</title></svelte:head>

<section class="stack recommendations" aria-labelledby="recommendations-title">
	<header>
		<p class="eyebrow"><Icon icon={Compass} size={16} />{m.predicted_order_label()}</p>
		<h1 id="recommendations-title">{m.recommendations_title()}</h1>
		<p class="lede">{m.recommendations_intro()}</p>
	</header>

	<div class="surface-card recommendation-explanation">
		<h2>
			{data.page.gate.mode === 'personalized'
				? m.personalized_order_title()
				: data.page.gate.mode === 'community-prior'
					? m.community_order_title()
					: m.insufficient_recommendation_title()}
		</h2>
		<p>
			{data.page.gate.mode === 'personalized'
				? m.personalized_order_body()
				: data.page.gate.mode === 'community-prior'
					? m.community_order_body({ count: data.page.gate.rankedPlaces })
					: m.insufficient_recommendation_body()}
		</p>
		<p class="field__hint">{m.review_isolation_explanation()}</p>
	</div>

	<form method="GET" class="surface-card recommendation-filter">
		<div class="field">
			<label for="recommendation-locality">{m.locality_filter()}</label>
			<input id="recommendation-locality" name="locality" value={data.locality} />
			<p class="field__hint">{m.recommendation_locality_help()}</p>
		</div>
		<Button type="submit"><Icon icon={Search} size={18} />{m.apply_filter()}</Button>
	</form>

	{#if form?.section === 'visited' && form?.error}
		<p class="form-status form-status--error" role="alert">{form.error}</p>
	{/if}

	{#if data.page.results.length === 0}
		<StatePanel
			title={data.locality ? m.recommendation_scope_empty() : m.insufficient_recommendation_title()}
			description={data.locality
				? m.recommendation_scope_empty_body()
				: m.insufficient_recommendation_body()}
		/>
		{#if data.locality}
			<Button href={localizeHref('/recommendations/restaurants', { locale })} variant="secondary">
				{m.expand_recommendation_scope()}
			</Button>
		{/if}
	{:else}
		<p class="recommendation-count">{m.recommendation_result_count({ count: data.page.total })}</p>
		<ol class="recommendation-grid" start={data.page.results[0]?.predictedPosition ?? 1}>
			{#each data.page.results as place (place.placeId)}
				<li class="place-result">
					<span class="recommendation-position">
						{m.predicted_position({ position: place.predictedPosition })}
					</span>
					<PlaceCard
						name={place.name}
						category="restaurant"
						locality={place.displayLocality}
						visited={place.visited}
						href={localizeHref(`/places/${encodeURIComponent(place.placeId)}`, { locale })}
					/>
					{#if place.visited}
						<span class="button button--quiet" aria-disabled="true">{m.visited()}</span>
					{:else}
						<form method="POST" action="?/addVisited">
							<input type="hidden" name="placeId" value={place.placeId} />
							<Button type="submit">{m.mark_already_visited()}</Button>
						</form>
					{/if}
				</li>
			{/each}
		</ol>
		{#if data.page.nextCursor}
			<Button
				href={localizeHref(
					`/recommendations/restaurants?${new URLSearchParams({ ...(data.locality ? { locality: data.locality } : {}), cursor: data.page.nextCursor }).toString()}`,
					{ locale }
				)}
				variant="secondary"
			>
				{m.next_recommendations()}
				<Icon icon={ArrowRight} size={18} />
			</Button>
		{/if}
	{/if}
</section>
