<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import CaseTimeline from '$lib/components/reviews/CaseTimeline.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data, form } = $props();
	let events = $derived([
		{ id: 'received', title: data.case.status, at: data.case.createdAt.toISOString() },
		...data.case.submissions.map((submission) => ({
			id: submission.id,
			title: m.notice_explanation(),
			description: submission.statement,
			at: submission.createdAt.toISOString()
		}))
	]);
</script>

<svelte:head><title>{m.case_status()} — {m.product_name()}</title></svelte:head>
<div class="stack narrow-content">
	<header>
		<p class="eyebrow">{data.case.id}</p>
		<h1>{m.case_status()}</h1>
	</header>
	<CaseTimeline {events} />
	{#if form?.error}<p class="form-status form-status--error" role="alert">{form.error}</p>{/if}
	{#if form?.saved}<p class="form-status" role="status">{m.save()}</p>{/if}
	<form method="POST" action="?/statement" class="stack-form">
		<input type="hidden" name="token" value={data.token} />
		<div class="field">
			<label for="case-statement">{m.notice_explanation()}</label>
			<textarea id="case-statement" name="statement" rows="6" maxlength="5000" required></textarea>
		</div>
		<Button type="submit">{m.save()}</Button>
	</form>
</div>
