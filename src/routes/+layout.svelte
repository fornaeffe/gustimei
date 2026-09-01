<script lang="ts">
	import AppShell from '$lib/components/ui/AppShell.svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<AppShell user={data.user} pendingRankingCount={data.pendingRankingCount}
	>{@render children()}</AppShell
>
