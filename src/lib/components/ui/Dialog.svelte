<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		open,
		title,
		description,
		children,
		onclose
	}: {
		open: boolean;
		title: string;
		description?: string;
		children: Snippet;
		onclose: () => void;
	} = $props();
	function syncDialog(dialog: HTMLDialogElement) {
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	}
</script>

<dialog {@attach syncDialog} class="dialog" {onclose} aria-labelledby="dialog-title">
	<div class="dialog__header">
		<div>
			<h2 id="dialog-title">{title}</h2>
			{#if description}<p>{description}</p>{/if}
		</div>
		<form method="dialog">
			<button class="icon-button" type="submit" aria-label={m.close_dialog()}
				><Icon icon={X} /></button
			>
		</form>
	</div>
	<div class="dialog__body">{@render children()}</div>
</dialog>
