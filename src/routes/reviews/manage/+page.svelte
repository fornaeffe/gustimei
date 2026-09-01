<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import Button from '$lib/components/ui/Button.svelte';
	import ReviewDisclosure from '$lib/components/reviews/ReviewDisclosure.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data, form } = $props();
	let locale = $derived(getLocale());
</script>

<svelte:head><title>{m.manage_reviews()} — {m.product_name()}</title></svelte:head>
<div class="stack">
	<header>
		<p class="eyebrow">{m.public_review_title()}</p>
		<h1>{m.manage_reviews()}</h1>
		<p class="lede">{m.reviews_manage_intro()}</p>
	</header>
	<ReviewDisclosure />
	{#if form?.error}<p class="form-status form-status--error" role="alert">{form.error}</p>{/if}
	{#if form?.withdrawn}<p class="form-status" role="status">{m.review_withdrawn()}</p>{/if}
	{#if data.reviews.length === 0}
		<StatePanel title={m.no_public_reviews()} description={m.review_management_empty()} />
	{:else}
		<div class="review-management-list">
			{#each data.reviews as review (review.reviewId)}
				<article class="surface-card stack">
					<header>
						<h2>{review.placeName ?? review.placeId}</h2>
						<span class="status-chip">{review.lifecycle}</span>
						{#if review.interimRestrictedAt}<span class="status-chip"
								>{m.interim_restriction_active()}</span
							>{/if}
					</header>
					<p class="review-card__body">{review.body}</p>
					<div class="form-footer">
						<Button
							href={localizeHref(`/places/${encodeURIComponent(review.placeId)}`, { locale })}
							variant="secondary">{m.view_place()}</Button
						>
						{#if review.lifecycle === 'published'}
							<Button
								href={localizeHref(`/reviews/manage/${review.reviewId}/edit`, { locale })}
								variant="quiet">{m.edit_review()}</Button
							>
							<form method="POST" action="?/withdraw" use:enhance>
								<input type="hidden" name="reviewId" value={review.reviewId} />
								<Button type="submit" variant="danger">{m.withdraw_review()}</Button>
							</form>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	{/if}
	{#if data.cases.length > 0}
		<section class="stack" aria-labelledby="review-cases-title">
			<h2 id="review-cases-title">{m.case_status()}</h2>
			{#each data.cases as item (item.id)}
				<a
					class="surface-card"
					href={resolve(localizeHref(`/reviews/cases/${item.id}`, { locale }) as Pathname)}
				>
					{item.id} · {item.status}
				</a>
			{/each}
		</section>
	{/if}
	<Button href={localizeHref('/legal/review-rules', { locale })} variant="secondary">
		{m.review_rules()}
	</Button>
</div>
