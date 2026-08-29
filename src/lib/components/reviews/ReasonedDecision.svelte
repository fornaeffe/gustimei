<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import LocalizedDateTime from '$lib/components/ui/LocalizedDateTime.svelte';
	let {
		outcome,
		scope,
		duration,
		ground,
		policyVersionId,
		reasons,
		factsReliedOn,
		automationDisclosure,
		decidedAt,
		redressSubmissionDeadline
	}: {
		outcome: string;
		scope: string;
		duration?: string | null;
		ground: string;
		policyVersionId: string;
		reasons: string;
		factsReliedOn: string;
		automationDisclosure: string;
		decidedAt: Date | string;
		redressSubmissionDeadline: Date | string;
	} = $props();
</script>

<article class="reasoned-decision">
	<header><strong>{outcome}</strong><LocalizedDateTime value={decidedAt} /></header>
	<dl>
		<dt>{m.decision_scope()}</dt>
		<dd>{scope}</dd>
		{#if duration}<dt>{m.decision_duration()}</dt>
			<dd>{duration}</dd>{/if}
		<dt>{m.decision_ground()}</dt>
		<dd>{ground}</dd>
		<dt>{m.policy_version()}</dt>
		<dd>{policyVersionId}</dd>
		<dt>{m.reasoned_explanation()}</dt>
		<dd>{reasons}</dd>
		<dt>{m.facts_relied_on()}</dt>
		<dd>{factsReliedOn}</dd>
		<dt>{m.automation_disclosure()}</dt>
		<dd>{automationDisclosure}</dd>
		<dt>{m.redress_window_ends()}</dt>
		<dd><LocalizedDateTime value={redressSubmissionDeadline} /></dd>
	</dl>
</article>
