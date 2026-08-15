<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		label,
		hint,
		error,
		children
	}: { id: string; label: string; hint?: string; error?: string; children: Snippet } = $props();
	let descriptionId = $derived(`${id}-description`);
</script>

<div class="field" class:field--invalid={Boolean(error)}>
	<label for={id}>{label}</label>
	{#if hint}<p class="field__hint" id={descriptionId}>{hint}</p>{/if}
	{@render children()}
	{#if error}<p class="field__error" id={`${id}-error`}>{error}</p>{/if}
</div>
