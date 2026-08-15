<script lang="ts">
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import Button from '$lib/components/ui/Button.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import * as m from '$lib/paraglide/messages';
	let locale = $derived(getLocale());
</script>

<svelte:head><title>{m.dashboard_primary_title()} — {m.product_name()}</title></svelte:head>
<StatePanel title={m.dashboard_empty_ranking()} description={m.coming_phase_four()}>
	{#snippet action()}<Button href={localizeHref('/dashboard', { locale })} variant="secondary"
			>{m.cancel()}</Button
		>{/snippet}
</StatePanel>
