<script lang="ts">
	let { data } = $props();
</script>

<svelte:head
	><title>Local email mailbox — GustiMei</title><meta
		name="robots"
		content="noindex"
	/></svelte:head
>
<article class="legal-page">
	<header>
		<p class="eyebrow">Development only</p>
		<h1>Local email mailbox</h1>
		<p>This page drains pending local outbox jobs. Never enable it in preview or production.</p>
	</header>
	{#if data.messages.length === 0}<p>No messages.</p>{/if}
	{#each data.messages as message, index (index)}
		<section>
			<h2>{message.template}</h2>
			<p>{message.recipient}</p>
			{#if message.variables.actionUrl}<p>
					<a href={message.variables.actionUrl}>Open action URL</a>
				</p>{/if}
		</section>
	{/each}
</article>
