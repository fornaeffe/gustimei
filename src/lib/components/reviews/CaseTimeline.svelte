<script lang="ts">
	import LocalizedDateTime from '$lib/components/ui/LocalizedDateTime.svelte';
	let { events }: { events: { id: string; title: string; description?: string; at: string }[] } =
		$props();
</script>

<ol class="case-timeline">
	{#each events as event (event.id)}
		<li>
			<LocalizedDateTime value={event.at} />
			<strong>{event.title}</strong>
			{#if event.description}<p>{event.description}</p>{/if}
		</li>
	{/each}
</ol>
