<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { contributionDisclosure } from '$lib/content/policies';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	let { form } = $props();
	let locale = $derived(getLocale());
	let errorMessage = $derived(
		form?.error === 'required'
			? m.validation_required()
			: form?.error === 'email'
				? m.validation_email()
				: form?.error === 'password-length'
					? m.validation_password_length()
					: form?.error === 'acceptances'
						? m.validation_acceptances()
						: form?.error === 'rate-limited'
							? m.rate_limited()
							: form?.error
								? m.generic_auth_error()
								: ''
	);
</script>

<svelte:head><title>{m.auth_sign_up_title()} — {m.product_name()}</title></svelte:head>
<article class="surface-card auth-card">
	<header>
		<p class="eyebrow">{m.create_account()}</p>
		<h1>{m.auth_sign_up_title()}</h1>
		<p>{m.auth_sign_up_intro()}</p>
	</header>
	{#if errorMessage}<p class="form-status form-status--error" role="alert">{errorMessage}</p>{/if}
	<form method="POST" use:enhance class="stack-form">
		<div class="field">
			<label for="name">{m.name()}</label>
			<p id="name-help" class="field__hint">{m.name_help()}</p>
			<input
				id="name"
				name="name"
				autocomplete="name"
				value={form?.values?.name ?? ''}
				aria-describedby="name-help"
				required
			/>
		</div>
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
			<label for="password">{m.password()}</label>
			<p id="password-help" class="field__hint">{m.password_help()}</p>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="new-password"
				minlength="8"
				aria-describedby="password-help"
				required
			/>
		</div>
		<div class="content-boundary content-boundary--private">
			<div>
				<strong>{m.disclosure_heading()}</strong>
				<p>{contributionDisclosure[locale]}</p>
			</div>
		</div>
		<label class="check-row"
			><input type="checkbox" name="adult" value="true" required />
			<span>{m.age_declaration()}</span></label
		>
		<label class="check-row"
			><input type="checkbox" name="terms" value="true" required />
			<span
				>{m.accept_terms()}
				<a href={resolve(localizeHref('/legal/terms', { locale }) as Pathname)}>{m.terms()}</a
				></span
			></label
		>
		<label class="check-row"
			><input type="checkbox" name="contribution" value="true" required />
			<span>{m.disclosure_acknowledgement()}</span></label
		>
		<p class="field__hint">
			{m.privacy_presented()}
			<a href={resolve(localizeHref('/legal/privacy', { locale }) as Pathname)}
				>{m.privacy_notice()}</a
			>
		</p>
		<Button type="submit">{m.create_and_verify()}</Button>
	</form>
	<p class="auth-switch">
		{m.already_registered()}
		<a href={resolve(localizeHref('/auth/sign-in', { locale }) as Pathname)}>{m.sign_in()}</a>
	</p>
</article>
