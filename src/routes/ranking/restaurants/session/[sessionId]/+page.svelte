<script lang="ts">
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import Button from '$lib/components/ui/Button.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import * as m from '$lib/paraglide/messages';
	let locale = $derived(getLocale());
</script>

<svelte:head><title>{m.start_ranking()} — {m.product_name()}</title></svelte:head>
<StatePanel title={m.ranking_ready()} description={m.phase_five_session_ready()}>
	{#snippet action()}
		<Button href={localizeHref('/ranking/restaurants', { locale })} variant="secondary">
			{m.cancel()}
		</Button>
	{/snippet}
</StatePanel>
