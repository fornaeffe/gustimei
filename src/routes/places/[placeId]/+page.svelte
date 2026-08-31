<script lang="ts">
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import Button from '$lib/components/ui/Button.svelte';
	import PlaceCard from '$lib/components/ui/PlaceCard.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import ReviewCard from '$lib/components/reviews/ReviewCard.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data, form } = $props();
	let locale = $derived(getLocale());
	let dateFormatter = $derived(new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }));
</script>

<svelte:head>
	<title>{data.place.name} — {m.product_name()}</title>
	<meta
		name="description"
		content={`${data.place.name}, ${data.place.displayLocality}. ${m.public_reviews_intro()}`}
	/>
</svelte:head>

<div class="place-detail stack">
	<PlaceCard
		name={data.place.name}
		category={data.place.category}
		locality={data.place.displayLocality}
	/>
	{#if data.place.addressLabel}<p>{data.place.addressLabel}</p>{/if}
	{#if data.visited}
		<span class="status-chip">{m.visited()}</span>
	{:else if data.authenticated}
		<form method="POST" action="?/addVisited">
			<Button type="submit">{m.mark_already_visited()}</Button>
		</form>
		{#if form?.section === 'visited' && form?.added}
			<p class="form-status" role="status">{m.visited()}</p>
		{/if}
	{/if}
	<p class="attribution">
		<a
			href={`https://www.openstreetmap.org/${data.place.source.elementType}/${data.place.source.elementId}`}
			rel="external">{m.catalogue_attribution()}</a
		>
	</p>

	<section class="stack" aria-labelledby="reviews-title">
		<header class="section-heading">
			<div>
				<p class="eyebrow">{m.public_review_title()}</p>
				<h2 id="reviews-title">{m.public_reviews()}</h2>
				<p>{m.public_reviews_intro()}</p>
			</div>
			{#if data.visited}
				<Button
					href={localizeHref(`/places/${encodeURIComponent(data.place.placeId)}/reviews/new`, {
						locale
					})}>{m.write_review()}</Button
				>
			{/if}
		</header>
		{#if data.reviews.items.length === 0}
			<StatePanel title={m.no_public_reviews()} description={m.public_reviews_intro()} />
		{:else}
			{#each data.reviews.items as review (review.versionId)}
				<div id={`review-${review.versionId}`}>
					<ReviewCard
						pseudonym={review.pseudonym}
						body={review.body}
						serviceMonth={review.serviceMonth}
						publishedLabel={m.published_on({ date: dateFormatter.format(review.publishedAt) })}
						edited={review.edited}
						presentation={review.presentation}
						reportHref={localizeHref(
							`/places/${encodeURIComponent(data.place.placeId)}/reviews/${review.versionId}/report`,
							{ locale }
						)}
					/>
				</div>
			{/each}
		{/if}
		{#if data.reviews.nextCursor}
			<Button
				href={`${localizeHref(`/places/${encodeURIComponent(data.place.placeId)}`, { locale })}?reviews=${encodeURIComponent(data.reviews.nextCursor)}`}
				variant="secondary">{m.load_more()}</Button
			>
		{/if}
	</section>
</div>
