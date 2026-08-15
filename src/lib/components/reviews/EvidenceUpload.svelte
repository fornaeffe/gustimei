<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import Button from '$lib/components/ui/Button.svelte';
	let { action = '?/evidence' }: { action?: string } = $props();
</script>

<form method="POST" enctype="multipart/form-data" {action} class="stack-form">
	<div class="content-boundary content-boundary--restricted">
		<strong>{m.restricted_evidence()}</strong>
		<p>{m.evidence_privacy_help()}</p>
	</div>
	<div class="field">
		<label for="evidence-file">{m.choose_evidence()}</label>
		<input
			id="evidence-file"
			name="evidence"
			type="file"
			accept=".pdf,.jpg,.jpeg,.png,.webp,.txt"
			required
		/>
		<p class="field__hint">{m.evidence_file_help()}</p>
	</div>
	<Button type="submit">{m.upload_evidence()}</Button>
</form>
