<script lang="ts">
	let {
		active,
		error,
		saved,
		savedMessage
	}: { active: boolean; error?: string; saved?: boolean; savedMessage: string } = $props();
</script>

{#if active && error}
	<p class="form-status form-status--error" role="alert">{error}</p>
{:else if active && saved}
	<p class="form-status" role="status">{savedMessage}</p>
{/if}
