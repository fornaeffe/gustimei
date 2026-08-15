<script lang="ts">
	let { events }: { events: { id: string; title: string; description?: string; at: string }[] } =
		$props();
</script>

<ol class="case-timeline">
	{#each events as event (event.id)}
		<li>
			<time datetime={event.at}>{event.at}</time>
			<strong>{event.title}</strong>
			{#if event.description}<p>{event.description}</p>{/if}
		</li>
	{/each}
</ol>
