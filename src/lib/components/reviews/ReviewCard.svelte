<script lang="ts">
	import { CalendarDays, Flag } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';
	import Icon from '$lib/components/ui/Icon.svelte';
	import ReviewDisclosure from './ReviewDisclosure.svelte';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';

	let {
		pseudonym,
		body,
		serviceMonth,
		edited = false,
		reportHref
	}: {
		pseudonym: string;
		body: string;
		serviceMonth: string;
		edited?: boolean;
		reportHref?: string;
	} = $props();
</script>

<article class="review-card">
	<header>
		<div>
			<strong>{pseudonym}</strong>{#if edited}<span class="status-chip">{m.edited()}</span>{/if}
		</div>
		<span><Icon icon={CalendarDays} size={16} />{serviceMonth}</span>
	</header>
	<p class="review-card__body">{body}</p>
	<footer>
		<ReviewDisclosure compact />
		{#if reportHref}<a href={resolve(reportHref as Pathname)}
				><Icon icon={Flag} size={16} />{m.report_review()}</a
			>{/if}
	</footer>
</article>
