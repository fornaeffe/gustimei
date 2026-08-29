<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';

	let locale = $derived(getLocale());
	let recoveryHref = $derived(
		localizeHref(`/reviews/cases/recover?case=${encodeURIComponent(page.params.noticeId ?? '')}`, {
			locale
		})
	);
</script>

<svelte:head><title>{m.case_access_recovery()} — {m.product_name()}</title></svelte:head>

<div class="stack narrow-content">
	<h1>{m.case_access_invalid()}</h1>
	<p>{m.case_access_recovery_intro()}</p>
	<Button href={recoveryHref}>{m.case_access_recovery()}</Button>
</div>
