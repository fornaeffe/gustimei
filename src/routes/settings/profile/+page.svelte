<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import StatePanel from '$lib/components/ui/StatePanel.svelte';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	let { data, form } = $props();
	let locale = $derived(getLocale());
</script>

<svelte:head><title>{m.settings_title()} — {m.product_name()}</title></svelte:head>
<div class="stack">
	<header>
		<p class="eyebrow">{m.nav_settings()}</p>
		<h1>{m.settings_title()}</h1>
		<p class="lede">{m.settings_intro()}</p>
	</header>
	<section class="surface-card stack" aria-labelledby="identity-title">
		<div>
			<h2 id="identity-title">{m.public_pseudonym()}</h2>
			<p>{m.pseudonym_help()}</p>
		</div>
		{#if !data.publicProfile}<StatePanel
				title={m.no_public_identity()}
				description={m.no_public_identity_body()}
			/>{/if}
		{#if form?.section === 'pseudonym' && form.error}<p
				class="form-status form-status--error"
				role="alert"
			>
				{form.error}
			</p>{/if}
		{#if form?.section === 'pseudonym' && form.saved}<p class="form-status" role="status">
				{m.pseudonym_saved()}
			</p>{/if}
		<form method="POST" action="?/pseudonym" use:enhance class="stack-form">
			<div class="field">
				<label for="pseudonym">{m.public_pseudonym()}</label><input
					id="pseudonym"
					name="pseudonym"
					value={data.publicProfile?.pseudonym ?? ''}
					minlength="3"
					maxlength="40"
					required
				/>
			</div>
			<Button type="submit">{m.save_pseudonym()}</Button>
		</form>
	</section>
	<section class="surface-card stack" aria-labelledby="locale-title">
		<h2 id="locale-title">{m.locale_preference()}</h2>
		<form method="POST" action="?/locale" use:enhance class="stack-form">
			<div class="field">
				<label for="locale">{m.locale_preference()}</label><select id="locale" name="locale"
					><option value="en" selected={data.preference?.locale === 'en'}>English</option><option
						value="it"
						selected={data.preference?.locale === 'it'}>Italiano</option
					></select
				>
			</div>
			<Button type="submit">{m.save_language()}</Button>
		</form>
	</section>
	<form method="POST" action={localizeHref('/auth/sign-out', { locale })}>
		<Button type="submit" variant="quiet">{m.sign_out()}</Button>
	</form>
</div>
