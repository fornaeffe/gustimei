<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	let { data } = $props();
</script>

<svelte:head><title>{data.content.title} — {m.product_name()}</title></svelte:head>
<article class="legal-page">
	<header>
		<p class="eyebrow">{m.product_name()}</p>
		<h1>{data.content.title}</h1>
		<p class="lede">{data.content.intro}</p>
		<p class="version">{m.legal_version({ version: data.version })}</p>
		<p class="form-status">{m.legal_draft_notice()}</p>
	</header>
	{#each data.content.sections as section (section[0])}
		<section>
			<h2>{section[0]}</h2>
			<p>{section[1]}</p>
		</section>
	{/each}
</article>
