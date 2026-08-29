<script lang="ts">
	import { untrack } from 'svelte';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import ReviewComposer from '$lib/components/reviews/ReviewComposer.svelte';
	import ReviewCard from '$lib/components/reviews/ReviewCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PlaceCard from '$lib/components/ui/PlaceCard.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data, form } = $props();
	let locale = $derived(getLocale());
	let reviewBody = $state(untrack(() => form?.body ?? ''));
	let serviceDate = $state(untrack(() => form?.serviceDate ?? ''));
	let serviceMonth = $derived(
		serviceDate
			? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
					new Date(`${serviceDate}T00:00:00.000Z`)
				)
			: ''
	);
</script>

<svelte:head><title>{m.write_review()} — {data.place.name}</title></svelte:head>
<div class="stack narrow-content">
	<header>
		<p class="eyebrow">{m.public_review_title()}</p>
		<h1>{m.write_review()}</h1>
	</header>
	<PlaceCard
		name={data.place.name}
		category={data.place.category}
		locality={data.place.displayLocality}
	/>
	{#if !data.profile}
		<StatePanel title={m.review_unavailable()} description={m.review_pseudonym_required_body()}>
			{#snippet action()}
				<Button href={localizeHref('/settings/profile', { locale })}>{m.save_pseudonym()}</Button>
			{/snippet}
		</StatePanel>
	{:else}
		{#if form?.error}<p class="form-status form-status--error" role="alert">{form.error}</p>{/if}
		<ReviewComposer
			bind:body={reviewBody}
			bind:serviceDate
			idempotencyKey={data.idempotencyKey}
			returnTo={data.returnTo}
			dismissHref={localizeHref(
				data.returnTo ?? `/places/${encodeURIComponent(data.place.placeId)}`,
				{ locale }
			)}
		/>
		{#if reviewBody.trim()}
			<section class="stack" aria-labelledby="review-preview-title">
				<h2 id="review-preview-title">{m.review_preview()}</h2>
				<ReviewCard pseudonym={data.profile.pseudonym} body={reviewBody} {serviceMonth} />
			</section>
		{/if}
	{/if}
</div>
