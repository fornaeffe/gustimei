<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import FormFeedback from '$lib/components/ui/FormFeedback.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
</script>

<svelte:head><title>{m.case_access_recovery()} — {m.product_name()}</title></svelte:head>

<div class="stack narrow-content">
	<header>
		<h1>{m.case_access_recovery()}</h1>
		<p>{m.case_access_recovery_intro()}</p>
	</header>
	<FormFeedback saved={form?.submitted} savedMessage={m.case_access_recovery_confirmation()} />
	<form method="POST" class="stack-form">
		<div class="field">
			<label for="case-reference">{m.case_reference()}</label>
			<input
				id="case-reference"
				name="caseReference"
				value={data.caseReference}
				required
				maxlength="200"
			/>
		</div>
		<div class="field">
			<label for="case-email">{m.contact_email()}</label>
			<input
				id="case-email"
				name="email"
				type="email"
				autocomplete="email"
				required
				maxlength="320"
			/>
		</div>
		<Button type="submit">{m.send_case_link()}</Button>
	</form>
</div>
