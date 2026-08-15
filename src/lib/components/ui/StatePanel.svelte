<script lang="ts">
	import { CircleAlert, Inbox } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		title,
		description,
		kind = 'empty',
		action
	}: { title: string; description: string; kind?: 'empty' | 'error'; action?: Snippet } = $props();
</script>

<section
	class="state-panel state-panel--{kind}"
	aria-live={kind === 'error' ? 'assertive' : 'polite'}
>
	<Icon icon={kind === 'error' ? CircleAlert : Inbox} size={28} />
	<div>
		<h2>{title}</h2>
		<p>{description}</p>
		{#if action}<div class="state-panel__action">{@render action()}</div>{/if}
	</div>
</section>
