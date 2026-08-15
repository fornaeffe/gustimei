<script lang="ts">
	import { Hotel, MapPin, UtensilsCrossed } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';
	import Icon from './Icon.svelte';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';

	let {
		name,
		category,
		locality,
		visited = false,
		href
	}: {
		name: string;
		category: 'restaurant' | 'hotel';
		locality: string;
		visited?: boolean;
		href?: string;
	} = $props();
	let categoryLabel = $derived(category === 'restaurant' ? m.restaurant() : m.hotel());
</script>

<article class="place-card place-card--{category}">
	<div class="place-card__media" aria-hidden="true">
		<Icon icon={category === 'restaurant' ? UtensilsCrossed : Hotel} size={48} />
		<span>{categoryLabel}</span>
	</div>
	<div class="place-card__body">
		<div class="place-card__meta">
			<span>{categoryLabel}</span>
			{#if visited}<span class="status-chip">{m.visited()}</span>{/if}
		</div>
		<h3>
			{#if href}<a href={resolve(href as Pathname)}>{name}</a>{:else}{name}{/if}
		</h3>
		<p><Icon icon={MapPin} size={16} />{locality}</p>
	</div>
</article>
