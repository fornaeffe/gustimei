<script lang="ts">
	import { Compass } from '@lucide/svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import RestaurantMap from '$lib/components/recommendations/RestaurantMap.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
</script>

<svelte:head><title>{m.map_discover_title()} — {m.product_name()}</title></svelte:head>

<section class="recommendations map-recommendations" aria-labelledby="recommendations-title">
	<header class="map-page-heading">
		<p class="eyebrow"><Icon icon={Compass} size={16} />{m.predicted_order_label()}</p>
		<h1 id="recommendations-title">{m.map_discover_title()}</h1>
		<p>{m.map_discover_short_intro()}</p>
	</header>

	<details class="surface-card recommendation-explanation">
		<summary
			>{data.page.gate.mode === 'personalized'
				? m.personalized_order_title()
				: data.page.gate.mode === 'community-prior'
					? m.community_order_title()
					: m.insufficient_recommendation_title()}</summary
		>
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
	</details>

	{#if form?.section === 'visited' && form?.error}
		<p class="form-status form-status--error" role="alert">{form.error}</p>
	{/if}

	{#if data.page.results.length === 0}
		<StatePanel
			title={m.insufficient_recommendation_title()}
			description={m.insufficient_recommendation_body()}
		/>
	{/if}
	<RestaurantMap
		places={data.page.results}
		tileUrl={data.mapTileUrl}
		artifactId={data.page.artifactId}
		visitedPlaceIds={data.visitedPlaceIds}
		rankingInvitation={data.rankingInvitation}
	/>
</section>
