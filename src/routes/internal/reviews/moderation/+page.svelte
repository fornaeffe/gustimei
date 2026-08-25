<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data } = $props();
	let locale = $derived(getLocale());
</script>

<svelte:head><title>{m.moderation_queue()} — {m.product_name()}</title></svelte:head>
<div class="stack">
	<header>
		<p class="eyebrow">{m.restricted_case_material()}</p>
		<h1>{m.moderation_queue()}</h1>
	</header>
	{#if data.cases.length === 0}
		<StatePanel title={m.moderation_queue_empty()} description={m.moderation_explanation()} />
	{:else}
		<div class="stack">
			{#each data.cases as item (item.id)}
				<article class="surface-card stack">
					<header class="cluster">
						<h2>
							<a
								href={resolve(
									localizeHref(`/internal/reviews/moderation/${item.id}`, { locale }) as Pathname
								)}>{item.id}</a
							>
						</h2>
						<span class="status-chip">{item.status}</span>
						{#if item.overdue}<strong class="form-status form-status--error">{m.overdue()}</strong
							>{/if}
					</header>
					<p>{item.kind} · {item.allegedGround}</p>
					<p>{m.assigned_moderator()}: {item.assignedModeratorId ?? '—'}</p>
				</article>
			{/each}
		</div>
	{/if}
</div>
