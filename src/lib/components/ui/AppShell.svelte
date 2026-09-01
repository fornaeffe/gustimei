<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import { deLocalizeHref, getLocale, localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { BookOpenText, Compass, ListOrdered, LogIn, Settings2 } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { ProductLocale } from '$lib/content/policies';

	let {
		children,
		user,
		pendingRankingCount = 0,
		wide = false
	}: {
		children: Snippet;
		user?: { email: string } | null;
		pendingRankingCount?: number;
		wide?: boolean;
	} = $props();
	let locale = $derived(getLocale());
	let otherLocale = $derived<ProductLocale>(locale === 'en' ? 'it' : 'en');
	let languageHref = $derived(
		localizeHref(deLocalizeHref(page.url.pathname + page.url.search), {
			locale: otherLocale
		})
	);
	let productPath = $derived(deLocalizeHref(page.url.pathname));
	let immersive = $derived(
		productPath === '/recommendations/restaurants' ||
			productPath.startsWith('/ranking/restaurants/session/')
	);
</script>

<a class="skip-link" href="#main-content">{m.skip_to_content()}</a>
<header class="site-header">
	<div class="site-header__inner">
		<a
			class="brand"
			href={resolve(localizeHref('/', { locale }) as Pathname)}
			aria-label={m.home_aria()}
		>
			<span class="brand__mark" aria-hidden="true">G</span>
			<span>{m.product_name()}</span>
		</a>
		<nav class="site-nav" aria-label={m.primary_navigation()}>
			{#if user}
				<a href={resolve(localizeHref('/recommendations/restaurants', { locale }) as Pathname)}>
					<Icon icon={Compass} size={18} />{m.nav_discover()}
				</a>
				<a href={resolve(localizeHref('/ranking/restaurants', { locale }) as Pathname)}>
					<Icon icon={ListOrdered} size={18} />{m.nav_ranking()}
					{#if pendingRankingCount > 0}<span class="nav-badge">{pendingRankingCount}</span>{/if}
				</a>
				<a href={resolve(localizeHref('/reviews/manage', { locale }) as Pathname)}>
					<Icon icon={BookOpenText} size={18} />{m.nav_reviews()}
				</a>
				<a href={resolve(localizeHref('/settings/profile', { locale }) as Pathname)}>
					<span class="user-identity" aria-hidden="true"
						>{user.email.slice(0, 1).toUpperCase()}</span
					>
					<span class="user-identity__label"
						><strong>{m.nav_settings()}</strong><small>{user.email}</small></span
					>
					<Icon icon={Settings2} size={18} />
				</a>
			{:else}
				<a href={resolve(localizeHref('/auth/sign-in', { locale }) as Pathname)}>
					<Icon icon={LogIn} size={18} />{m.sign_in()}
				</a>
			{/if}
			<a
				class="language-switch"
				href={resolve(languageHref as Pathname)}
				hreflang={otherLocale}
				lang={otherLocale}
				data-sveltekit-reload
			>
				{otherLocale.toUpperCase()}
			</a>
		</nav>
	</div>
</header>

<main
	id="main-content"
	class:page-wide={wide}
	class:page-immersive={immersive}
	class="page-shell"
	tabindex="-1"
>
	{@render children()}
</main>

<footer class="site-footer" class:site-footer--hidden={immersive}>
	<div>
		<strong>{m.product_name()}</strong>
		<p>{m.footer_promise()}</p>
	</div>
	<nav aria-label={m.legal_navigation()}>
		<a href={resolve(localizeHref('/legal/privacy', { locale }) as Pathname)}
			>{m.privacy_notice()}</a
		>
		<a href={resolve(localizeHref('/legal/terms', { locale }) as Pathname)}>{m.terms()}</a>
		<a href={resolve(localizeHref('/legal/review-rules', { locale }) as Pathname)}
			>{m.review_rules()}</a
		>
	</nav>
</footer>
