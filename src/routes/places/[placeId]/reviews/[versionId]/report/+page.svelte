<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import FormFeedback from '$lib/components/ui/FormFeedback.svelte';
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
	{#if form?.submitted}
		<FormFeedback
			saved
			savedMessage={form.duplicate
				? m.notice_duplicate_reused()
				: form.caseHref
					? m.notice_submitted()
					: m.notice_submitted_without_case_access()}
		/>
		<FormFeedback error={form.evidenceError} />
		{#if form.caseHref}<Button href={form.caseHref}>{m.case_status()}</Button>{/if}
	{:else}
		<NoticeForm
			versionId={data.review.versionId}
			feedbackError={form?.error}
			errorField={form?.field}
		/>
	{/if}
</div>
