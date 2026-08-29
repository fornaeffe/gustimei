<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import FormFeedback from '$lib/components/ui/FormFeedback.svelte';
	import LocalizedDateTime from '$lib/components/ui/LocalizedDateTime.svelte';
	import CaseTimeline from '$lib/components/reviews/CaseTimeline.svelte';
	import ReasonedDecision from '$lib/components/reviews/ReasonedDecision.svelte';
	import EvidenceUpload from '$lib/components/reviews/EvidenceUpload.svelte';
	import { reviewCaseAction, reviewCaseEvidencePath } from '$lib/domain/reviews/case-routes';
	import * as m from '$lib/paraglide/messages';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';

	let { data, form } = $props();
	let locale = $derived(getLocale());
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
		<span class="status-chip">{data.case.status}</span>
	</header>

	<CaseTimeline {events} />
	{#if data.case.submissionDeadline}
		<p>{m.submission_window_ends()} <LocalizedDateTime value={data.case.submissionDeadline} /></p>
	{/if}

	{#if data.case.submissionOpen}
		<section class="surface-card stack">
			<FormFeedback
				active={form?.section === 'statement'}
				error={form?.error}
				saved={form?.saved}
				savedMessage={m.action_saved()}
			/>
			<form method="POST" action={reviewCaseAction('statement', data.token)} class="stack-form">
				{#if data.token}<input type="hidden" name="token" value={data.token} />{/if}
				<div class="field">
					<label for="case-statement">{m.notice_explanation()}</label>
					<textarea id="case-statement" name="statement" rows="6" maxlength="5000" required
					></textarea>
				</div>
				<Button type="submit">{m.save()}</Button>
			</form>
		</section>
	{/if}

	{#each data.case.decisions as decision (decision.id)}
		<ReasonedDecision
			outcome={decision.outcome}
			scope={decision.scope}
			duration={decision.duration}
			ground={decision.ground}
			policyVersionId={decision.policyVersionId}
			reasons={decision.reasonedExplanation}
			factsReliedOn={decision.factsReliedOn}
			automationDisclosure={decision.automationDisclosure}
			decidedAt={decision.decidedAt}
			redressSubmissionDeadline={decision.redressSubmissionDeadline}
		/>
		{#if decision.redressOpen}
			<form method="POST" action={reviewCaseAction('redress', data.token)} class="stack-form">
				<FormFeedback
					active={form?.section === 'redress'}
					error={form?.error}
					saved={form?.saved}
					savedMessage={m.action_saved()}
				/>
				{#if data.token}<input type="hidden" name="token" value={data.token} />{/if}
				<input type="hidden" name="decisionId" value={decision.id} />
				<div class="field">
					<label for={`redress-${decision.id}`}>{m.request_redress()}</label>
					<textarea
						id={`redress-${decision.id}`}
						name="statement"
						rows="5"
						maxlength="5000"
						required></textarea>
				</div>
				<Button type="submit" variant="secondary">{m.request_redress()}</Button>
			</form>
		{/if}
	{/each}

	{#if data.case.redress.length > 0}
		<section class="surface-card stack">
			<h2>{m.request_redress()}</h2>
			{#each data.case.redress as request (request.id)}
				<article>
					<p><strong>{request.status}</strong></p>
					<p>{request.statement}</p>
					<p>{m.redress_decision_due()}: <LocalizedDateTime value={request.decisionDueAt} /></p>
				</article>
			{/each}
		</section>
	{/if}

	{#if data.case.status !== 'closed'}
		<section class="surface-card stack">
			<FormFeedback
				active={form?.section === 'evidence'}
				error={form?.error}
				saved={form?.saved}
				savedMessage={m.action_saved()}
			/>
			<EvidenceUpload action={reviewCaseAction('evidence', data.token)} />
		</section>
	{/if}

	{#if data.case.evidence.length > 0}
		<section class="surface-card stack" aria-labelledby="your-evidence-title">
			<h2 id="your-evidence-title">{m.your_case_evidence()}</h2>
			{#each data.case.evidence as item (item.id)}
				<div class="stack">
					<p>
						<strong>{item.originalFilename ?? item.id}</strong> · {item.scanState} · {item.sizeBytes}
						bytes
					</p>
					<div class="cluster">
						{#if item.scanState === 'clean'}
							<Button
								href={localizeHref(
									reviewCaseEvidencePath({
										audience: 'party',
										noticeId: data.case.id,
										evidenceId: item.id,
										token: data.token
									}),
									{ locale }
								)}
								variant="secondary">{m.open_evidence()}</Button
							>
						{/if}
						<form method="POST" action={reviewCaseAction('deleteEvidence', data.token)}>
							{#if data.token}<input type="hidden" name="token" value={data.token} />{/if}
							<input type="hidden" name="evidenceId" value={item.id} />
							<Button type="submit" variant="danger">{m.delete_evidence()}</Button>
						</form>
					</div>
				</div>
			{/each}
		</section>
	{/if}
</div>
