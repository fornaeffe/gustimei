<script lang="ts">
	let {
		active = true,
		error,
		saved,
		savedMessage = '',
		warning
	}: {
		active?: boolean;
		error?: string;
		saved?: boolean;
		savedMessage?: string;
		warning?: string;
	} = $props();
</script>

{#if active && error}
	<p class="form-status form-status--error" role="alert">{error}</p>
{:else if active && saved}
	<p class="form-status form-status--success" role="status">{savedMessage}</p>
{:else if active && warning}
	<p class="form-status" role="status">{warning}</p>
{/if}
