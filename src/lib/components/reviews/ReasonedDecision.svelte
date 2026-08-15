<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	let {
		outcome,
		reasons,
		decidedAt,
		redressHref
	}: { outcome: string; reasons: string; decidedAt: string; redressHref?: string } = $props();
</script>

<article class="reasoned-decision">
	<header><strong>{outcome}</strong><time datetime={decidedAt}>{decidedAt}</time></header>
	<p>{reasons}</p>
	{#if redressHref}<a href={resolve(redressHref as Pathname)}>{m.request_redress()}</a>{/if}
</article>
