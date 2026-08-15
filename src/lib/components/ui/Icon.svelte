<script lang="ts">
	import type { Component } from 'svelte';

	let {
		icon: IconComponent,
		size = 20,
		label
	}: { icon: Component<Record<string, unknown>>; size?: number; label?: string } = $props();
</script>

{#if label}
	<span class="ui-icon" role="img" aria-label={label}>
		<IconComponent {size} strokeWidth={1.8} aria-hidden="true" />
	</span>
{:else}
	<span class="ui-icon" aria-hidden="true">
		<IconComponent {size} strokeWidth={1.8} />
	</span>
{/if}
