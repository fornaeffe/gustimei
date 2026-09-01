<script lang="ts">
	import { page } from '$app/state';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	let locale = $derived(getLocale());
	let failed = $derived(page.url.searchParams.has('error'));
</script>

<svelte:head
	><title
		>{failed ? m.verification_error_title() : m.verification_success_title()} — {m.product_name()}</title
	></svelte:head
>
<article class="surface-card auth-card stack">
	<h1>{failed ? m.verification_error_title() : m.verification_success_title()}</h1>
	<p>{failed ? m.verification_error_body() : m.verification_success_body()}</p>
	<Button
		href={localizeHref(failed ? '/auth/check-email' : '/recommendations/restaurants', { locale })}
		>{failed ? m.resend_verification() : m.continue_discover()}</Button
	>
</article>
