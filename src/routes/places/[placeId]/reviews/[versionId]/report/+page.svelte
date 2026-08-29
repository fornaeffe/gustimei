<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import NoticeForm from '$lib/components/reviews/NoticeForm.svelte';
	import ReviewCard from '$lib/components/reviews/ReviewCard.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data, form } = $props();
</script>

<svelte:head><title>{m.report_review()} — {data.place.name}</title></svelte:head>
<div class="stack narrow-content">
	<header>
		<h1>{m.report_review()}</h1>
		<p>{data.place.name}</p>
	</header>
	<ReviewCard pseudonym={data.review.pseudonym} body={data.review.body} serviceMonth="" />
	{#if form?.error}<p class="form-status form-status--error" role="alert">{form.error}</p>{/if}
	{#if form?.submitted}
		<p class="form-status" role="status">
			{form.duplicate
				? m.notice_duplicate_reused()
				: form.caseHref
					? m.notice_submitted()
					: m.notice_submitted_without_case_access()}
		</p>
		{#if form.evidenceError}<p class="form-status form-status--error" role="alert">
				{form.evidenceError}
			</p>{/if}
		{#if form.caseHref}<Button href={form.caseHref}>{m.case_status()}</Button>{/if}
	{:else}
		<NoticeForm versionId={data.review.versionId} />
	{/if}
</div>
