<script lang="ts">
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import FormFeedback from '$lib/components/ui/FormFeedback.svelte';
	import RestaurantMap from '$lib/components/recommendations/RestaurantMap.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
</script>

<svelte:head><title>{m.map_discover_title()} — {m.product_name()}</title></svelte:head>

<section class="recommendations map-recommendations" aria-label={m.map_discover_title()}>
	<FormFeedback active={form?.section === 'visited'} error={form?.error} />

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
		recommendationGate={data.page.gate}
	/>
</section>
