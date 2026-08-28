<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import CaseTimeline from '$lib/components/reviews/CaseTimeline.svelte';
	import ReasonedDecision from '$lib/components/reviews/ReasonedDecision.svelte';
	import { reviewCaseEvidencePath } from '$lib/domain/reviews/case-routes';
	import * as m from '$lib/paraglide/messages';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	let { data, form } = $props();
	let locale = $derived(getLocale());
	let events = $derived(
		data.case.events.map((item) => ({
			id: item.id,
			title: item.action,
			description: item.reasonCode,
			at: item.createdAt.toISOString()
		}))
	);
	let assignedModerator = $derived(
		data.assignment.assignableModerators.find(
			(moderator) => moderator.userId === data.case.assignedModeratorId
		)
	);
	let availableModerators = $derived(
		data.assignment.assignableModerators.filter(
			(moderator) => moderator.userId !== data.case.assignedModeratorId
		)
	);
	let canAssignToSelf = $derived(
		(!data.case.assignedModeratorId &&
			(data.case.status === 'received' || data.case.status === 'awaiting-submissions')) ||
			(data.assignment.actorRole === 'admin' &&
				data.case.status === 'under-review' &&
				data.case.assignedModeratorId !== data.assignment.actorUserId)
	);
</script>

<svelte:head><title>{m.moderation_case()} — {m.product_name()}</title></svelte:head>
<div class="stack">
	<header>
		<p class="eyebrow">{data.case.id}</p>
		<h1>{m.moderation_case()}</h1>
		<div class="cluster">
			<span class="status-chip">{data.case.status}</span>
			<span>{data.case.kind}</span>
			<span>{data.case.ownerAssertion}</span>
		</div>
	</header>
	{#if form?.error}<p class="form-status form-status--error" role="alert">{form.error}</p>{/if}
	{#if form?.saved}<p class="form-status" role="status">{m.save()}</p>{/if}

	<section class="surface-card stack content-boundary content-boundary--restricted">
		<h2>{m.exact_reported_version()}</h2>
		<p><strong>{data.case.pseudonym}</strong></p>
		<p class="review-card__body">{data.case.versionBody}</p>
		<h3>{m.notice_explanation()}</h3>
		<p>{data.case.explanation}</p>
		<p>{data.case.allegedGround}</p>
	</section>

	<section class="surface-card stack">
		<h2>{m.assigned_moderator()}</h2>
		<p>
			{#if assignedModerator}
				{assignedModerator.name} ({assignedModerator.email})
			{:else}
				{data.case.assignedModeratorId ?? m.unassigned_case()}
			{/if}
		</p>
		{#if canAssignToSelf}
			<form method="POST" action="?/assign" use:enhance>
				<Button type="submit">{m.assign_to_me()}</Button>
			</form>
		{/if}
		{#if data.assignment.actorRole === 'admin' && availableModerators.length > 0}
			<form method="POST" action="?/assign" use:enhance class="stack-form">
				<label for="moderator-user-id">{m.assign_case_to()}</label>
				<select id="moderator-user-id" name="moderatorUserId" required>
					<option value="" disabled selected>{m.choose_moderator()}</option>
					{#each availableModerators as moderator (moderator.userId)}
						<option value={moderator.userId}>
							{moderator.name} ({moderator.email}) · {moderator.role === 'admin'
								? m.review_administrator()
								: m.review_moderator()}
						</option>
					{/each}
				</select>
				<Button type="submit">{m.assign_moderator()}</Button>
			</form>
		{/if}
		{#if data.case.ownerAssertion !== 'none'}
			<form method="POST" action="?/ownerAssertion" use:enhance class="stack-form">
				<label for="owner-reason">{m.reason_code()}</label>
				<input id="owner-reason" name="reasonCode" required maxlength="500" />
				<div class="cluster">
					<Button type="submit" name="verified" value="true">Verify</Button>
					<Button type="submit" name="verified" value="false" variant="secondary">Reject</Button>
				</div>
			</form>
		{/if}
	</section>

	<section class="surface-card stack">
		<h2>{m.restricted_evidence()}</h2>
		{#each data.case.submissions as submission (submission.id)}
			<article>
				<strong>{submission.partyRole}</strong>
				<p>{submission.statement}</p>
			</article>
		{/each}
		{#each data.case.evidence as item (item.id)}
			<div class="cluster">
				<p>
					{item.uploaderRole}: {item.originalFilename ?? item.id} · {item.scanState} · {item.sizeBytes}
					bytes
				</p>
				{#if item.scanState === 'clean'}
					<Button
						href={localizeHref(
							reviewCaseEvidencePath({
								audience: 'moderator',
								noticeId: data.case.id,
								evidenceId: item.id
							}),
							{ locale }
						)}
						variant="secondary">{m.open_evidence()}</Button
					>
				{/if}
				{#if item.scanState === 'pending'}
					<form method="POST" action="?/scanEvidence" use:enhance>
						<input type="hidden" name="evidenceId" value={item.id} />
						<Button type="submit" name="clean" value="true" variant="secondary">Mark clean</Button>
						<Button type="submit" name="clean" value="false" variant="danger">Reject</Button>
					</form>
				{/if}
			</div>
		{/each}
	</section>

	<section class="surface-card stack">
		<h2>{m.interim_restrict()}</h2>
		<form method="POST" action="?/restrict" use:enhance class="cluster">
			<label for="restriction-reason">{m.reason_code()}</label>
			<input id="restriction-reason" name="reasonCode" required maxlength="500" />
			<Button type="submit" variant="danger">{m.interim_restrict()}</Button>
		</form>
	</section>

	<section class="surface-card stack">
		<h2>{m.reasoned_explanation()}</h2>
		{#each data.case.decisions as decision (decision.id)}
			<ReasonedDecision
				outcome={decision.outcome}
				reasons={decision.reasonedExplanation}
				decidedAt={decision.decidedAt.toISOString()}
			/>
		{/each}
		{#each data.case.redress as request (request.id)}
			<p><strong>{request.partyRole} · {request.status}</strong>: {request.statement}</p>
		{/each}
		<form method="POST" action="?/decide" use:enhance class="stack-form">
			<label for="decision-outcome">{m.decision_outcome()}</label>
			<select id="decision-outcome" name="outcome" required>
				<option value="no-action">no-action</option><option value="restrict">restrict</option
				><option value="remove">remove</option><option value="restore">restore</option>
			</select>
			<label for="decision-scope">{m.decision_scope()}</label><input
				id="decision-scope"
				name="scope"
				required
				maxlength="500"
			/>
			<label for="decision-duration">Duration</label><input
				id="decision-duration"
				name="duration"
				maxlength="500"
			/>
			<label for="decision-ground">{m.decision_ground()}</label><input
				id="decision-ground"
				name="ground"
				required
				maxlength="500"
			/>
			<label for="decision-reason">{m.reasoned_explanation()}</label><textarea
				id="decision-reason"
				name="reasonedExplanation"
				minlength="20"
				maxlength="5000"
				required></textarea>
			<label for="decision-facts">{m.facts_relied_on()}</label><textarea
				id="decision-facts"
				name="factsReliedOn"
				maxlength="5000"
				required></textarea>
			<label for="decision-automation">{m.automation_disclosure()}</label><textarea
				id="decision-automation"
				name="automationDisclosure"
				maxlength="500"
				required>No automated final decision was used.</textarea
			>
			<Button type="submit">{m.submit_decision()}</Button>
		</form>
	</section>

	<section class="surface-card stack">
		<h2>{m.case_status()}</h2>
		<CaseTimeline {events} />
		{#if data.case.status === 'decided'}<form method="POST" action="?/close" use:enhance>
				<Button type="submit" variant="secondary">{m.close_case()}</Button>
			</form>{/if}
	</section>
</div>
