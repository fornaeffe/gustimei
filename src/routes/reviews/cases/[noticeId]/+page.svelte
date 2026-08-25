<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import CaseTimeline from '$lib/components/reviews/CaseTimeline.svelte';
	import ReasonedDecision from '$lib/components/reviews/ReasonedDecision.svelte';
	import EvidenceUpload from '$lib/components/reviews/EvidenceUpload.svelte';
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
	{#if data.case.submissionDeadline}<p>
			{m.submission_window_ends()}
			<time datetime={data.case.submissionDeadline.toISOString()}
				>{data.case.submissionDeadline.toISOString()}</time
			>
		</p>{/if}
	{#if form?.error}<p class="form-status form-status--error" role="alert">{form.error}</p>{/if}
	{#if form?.saved}<p class="form-status" role="status">{m.save()}</p>{/if}
	<form method="POST" action="?/statement" class="stack-form">
		{#if data.token}<input type="hidden" name="token" value={data.token} />{/if}
		<div class="field">
			<label for="case-statement">{m.notice_explanation()}</label>
			<textarea id="case-statement" name="statement" rows="6" maxlength="5000" required></textarea>
		</div>
		<Button type="submit">{m.save()}</Button>
	</form>
	<EvidenceUpload
		action={data.token ? `?/evidence&token=${encodeURIComponent(data.token)}` : '?/evidence'}
	/>
	{#if data.case.evidence.length > 0}
		<section class="surface-card stack" aria-labelledby="your-evidence-title">
			<h2 id="your-evidence-title">{m.your_case_evidence()}</h2>
			{#each data.case.evidence as item (item.id)}
				<div class="stack">
					<p>
						<strong>{item.originalFilename ?? item.id}</strong> · {item.scanState} ·
						{item.sizeBytes} bytes
					</p>
					<div class="cluster">
						{#if item.scanState === 'clean'}
							<Button
								href={`./${data.case.id}/evidence/${item.id}${data.token ? `?token=${encodeURIComponent(data.token)}` : ''}`}
								variant="secondary">{m.open_evidence()}</Button
							>
						{/if}
						<form method="POST" action="?/deleteEvidence">
							{#if data.token}<input type="hidden" name="token" value={data.token} />{/if}
							<input type="hidden" name="evidenceId" value={item.id} />
							<Button type="submit" variant="danger">{m.delete_evidence()}</Button>
						</form>
					</div>
				</div>
			{/each}
		</section>
	{/if}
	{#each data.case.decisions as decision (decision.id)}
		<ReasonedDecision
			outcome={decision.outcome}
			reasons={decision.reasonedExplanation}
			decidedAt={decision.decidedAt.toISOString()}
		/>
		{#if !data.case.redress.some((request) => request.decisionId === decision.id)}
			<form method="POST" action="?/redress" class="stack-form">
				{#if data.token}<input type="hidden" name="token" value={data.token} />{/if}
				<input type="hidden" name="decisionId" value={decision.id} />
				<label for={`redress-${decision.id}`}>{m.request_redress()}</label>
				<textarea id={`redress-${decision.id}`} name="statement" rows="5" maxlength="5000" required
				></textarea>
				<Button type="submit" variant="secondary">{m.request_redress()}</Button>
			</form>
		{/if}
	{/each}
</div>
