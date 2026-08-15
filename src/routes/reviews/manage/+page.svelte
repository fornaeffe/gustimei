<script lang="ts">
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import Button from '$lib/components/ui/Button.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import ReviewDisclosure from '$lib/components/reviews/ReviewDisclosure.svelte';
	import * as m from '$lib/paraglide/messages';
	let locale = $derived(getLocale());
</script>

<svelte:head><title>{m.manage_reviews()} — {m.product_name()}</title></svelte:head>
<div class="stack">
	<header>
		<p class="eyebrow">{m.public_review_title()}</p>
		<h1>{m.manage_reviews()}</h1>
	</header>
	<ReviewDisclosure />
	<StatePanel title={m.dashboard_empty_ranking()} description={m.dashboard_reviews_body()}>
		{#snippet action()}<Button
				href={localizeHref('/legal/review-rules', { locale })}
				variant="secondary">{m.review_rules()}</Button
			>{/snippet}
	</StatePanel>
</div>
