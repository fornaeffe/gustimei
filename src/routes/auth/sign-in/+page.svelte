<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import Button from '$lib/components/ui/Button.svelte';
	import FormFeedback from '$lib/components/ui/FormFeedback.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data, form } = $props();
	let locale = $derived(getLocale());
</script>

<svelte:head><title>{m.auth_sign_in_title()} — {m.product_name()}</title></svelte:head>
<article class="surface-card auth-card">
	<header>
		<p class="eyebrow">{m.sign_in()}</p>
		<h1>{m.auth_sign_in_title()}</h1>
		<p>{m.auth_sign_in_intro()}</p>
	</header>
	<FormFeedback
		error={form?.error === 'rate-limited'
			? m.rate_limited()
			: form?.error
				? m.generic_auth_error()
				: undefined}
	/>
	<form method="POST" use:enhance class="stack-form">
		<input type="hidden" name="redirectTo" value={form?.values?.redirectTo ?? data.redirectTo} />
		<div class="field">
			<label for="email">{m.email()}</label><input
				id="email"
				name="email"
				type="email"
				autocomplete="email"
				value={form?.values?.email ?? ''}
				required
			/>
		</div>
		<div class="field">
			<label for="password">{m.password()}</label><input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
			/>
		</div>
		<label class="check-row"
			><input type="checkbox" name="rememberMe" value="true" checked />
			<span>{m.remember_me()}</span></label
		>
		<div class="form-footer">
			<a href={resolve(localizeHref('/auth/forgot-password', { locale }) as Pathname)}
				>{m.forgot_password()}</a
			><Button type="submit">{m.sign_in_action()}</Button>
		</div>
	</form>
	<p class="auth-switch">
		{m.need_account()}
		<a href={resolve(localizeHref('/auth/sign-up', { locale }) as Pathname)}>{m.create_account()}</a
		>
	</p>
</article>
