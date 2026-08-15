<script lang="ts">
	import { enhance } from '$app/forms';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data, form } = $props();
	let locale = $derived(getLocale());
</script>

<svelte:head><title>{m.reset_title()} — {m.product_name()}</title></svelte:head>
<article class="surface-card auth-card">
	<header><h1>{m.reset_title()}</h1></header>
	{#if form?.success}
		<p class="form-status" role="status">{m.password_reset_success()}</p>
		<Button href={localizeHref('/auth/sign-in', { locale })}>{m.sign_in()}</Button>
	{:else}
		{#if form?.error}<p class="form-status form-status--error" role="alert">
				{form.error === 'password-length'
					? m.validation_password_length()
					: form.error === 'password-match'
						? m.validation_password_match()
						: m.invalid_or_expired_link()}
			</p>{/if}
		<form method="POST" use:enhance class="stack-form">
			<input type="hidden" name="token" value={form?.token ?? data.token} />
			<div class="field">
				<label for="password">{m.new_password()}</label><input
					id="password"
					name="password"
					type="password"
					autocomplete="new-password"
					minlength="8"
					required
				/>
			</div>
			<div class="field">
				<label for="confirmation">{m.confirm_password()}</label><input
					id="confirmation"
					name="confirmation"
					type="password"
					autocomplete="new-password"
					minlength="8"
					required
				/>
			</div>
			<Button type="submit">{m.reset_password()}</Button>
		</form>
	{/if}
</article>
