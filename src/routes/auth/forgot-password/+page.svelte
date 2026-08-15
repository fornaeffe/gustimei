<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	let { form } = $props();
</script>

<svelte:head><title>{m.forgot_title()} — {m.product_name()}</title></svelte:head>
<article class="surface-card auth-card">
	<header>
		<h1>{m.forgot_title()}</h1>
		<p>{m.forgot_intro()}</p>
	</header>
	{#if form?.sent}<p class="form-status" role="status">{m.reset_request_confirmation()}</p>{/if}
	{#if form?.error}<p class="form-status form-status--error" role="alert">
			{form.error === 'rate-limited' ? m.rate_limited() : m.validation_email()}
		</p>{/if}
	<form method="POST" use:enhance class="stack-form">
		<div class="field">
			<label for="email">{m.email()}</label><input
				id="email"
				name="email"
				type="email"
				autocomplete="email"
				value={form?.email ?? ''}
				required
			/>
		</div>
		<Button type="submit">{m.send_reset_link()}</Button>
	</form>
</article>
