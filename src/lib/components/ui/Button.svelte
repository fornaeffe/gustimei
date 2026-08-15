<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';

	let {
		children,
		href,
		variant = 'primary',
		type = 'button',
		disabled = false,
		name,
		value,
		onclick,
		ariaLabel
	}: {
		children: Snippet;
		href?: string;
		variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		name?: string;
		value?: string;
		onclick?: (event: MouseEvent) => void;
		ariaLabel?: string;
	} = $props();
</script>

{#if href}
	<a class="button button--{variant}" href={resolve(href as Pathname)} aria-label={ariaLabel}
		>{@render children()}</a
	>
{:else}
	<button
		class="button button--{variant}"
		{type}
		{disabled}
		{name}
		{value}
		{onclick}
		aria-label={ariaLabel}
	>
		{@render children()}
	</button>
{/if}
