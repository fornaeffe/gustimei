<script lang="ts">
	import { enhance } from '$app/forms';
	import { MailCheck } from '@lucide/svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import * as m from '$lib/paraglide/messages';
	let { form } = $props();
</script>

<svelte:head><title>{m.check_email_title()} — {m.product_name()}</title></svelte:head>
<article class="surface-card auth-card stack">
	<Icon icon={MailCheck} size={36} />
	<header>
		<h1>{m.check_email_title()}</h1>
		<p>{m.check_email_body()}</p>
	</header>
	{#if form?.sent}<p class="form-status" role="status">{m.verification_sent()}</p>{/if}
	{#if form?.error}<p class="form-status form-status--error" role="alert">
			{form.error === 'rate-limited' ? m.rate_limited() : m.validation_email()}
		</p>{/if}
	<form method="POST" action="?/resend" use:enhance class="stack-form">
		<div class="field">
			<label for="email">{m.email()}</label><input
				id="email"
				name="email"
				type="email"
				autocomplete="email"
				required
			/>
		</div>
		<Button type="submit">{m.resend_verification()}</Button>
	</form>
</article>
