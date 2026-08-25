<script lang="ts">
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { ArrowRight, BookOpenText, Compass, ListOrdered } from '@lucide/svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data } = $props();
	let locale = $derived(getLocale());
</script>

<svelte:head><title>{m.nav_discover()} — {m.product_name()}</title></svelte:head>
<header class="dashboard-header">
	<div>
		<p class="eyebrow">{data.emailVerified ? m.verified_account() : m.unverified_account()}</p>
		<h1>{m.dashboard_title()}</h1>
		<p class="lede">
			{data.restaurantRanking
				? m.dashboard_ranking_ready_intro()
				: data.restaurantPlaces >= 2
					? m.dashboard_ranking_pending_intro()
					: m.dashboard_intro()}
		</p>
	</div>
</header>
<section class="dashboard-grid" aria-label={m.nav_discover()}>
	<article class="surface-card dashboard-card dashboard-card--primary">
		<div>
			<Icon icon={Compass} size={30} />
			<h2>{m.dashboard_primary_title()}</h2>
			<p>{m.dashboard_primary_body()}</p>
		</div>
		<Button href={localizeHref('/ranking/restaurants', { locale })}
			>{m.dashboard_primary_action()} <Icon icon={ArrowRight} size={18} /></Button
		>
	</article>
	<article class="surface-card dashboard-card">
		<div>
			<Icon icon={ListOrdered} size={28} />
			<h2>{m.dashboard_ranking_title()}</h2>
			<p>
				{data.restaurantRanking
					? m.dashboard_ready_ranking_body({
							ranked: data.restaurantRanking.rankedPlaces,
							unresolved: data.restaurantRanking.unresolvedPlaces
						})
					: data.restaurantPlaces
						? m.dashboard_pending_ranking_body({ count: data.restaurantPlaces })
						: m.dashboard_empty_ranking_body()}
			</p>
		</div>
		{#if data.restaurantRanking?.sessionId}
			<Button
				href={localizeHref(`/ranking/restaurants/session/${data.restaurantRanking.sessionId}`, {
					locale
				})}
				variant="secondary"
			>
				{m.view_restaurant_ranking()}
				<Icon icon={ArrowRight} size={18} />
			</Button>
		{:else}
			<Button href={localizeHref('/ranking/restaurants', { locale })} variant="secondary">
				{data.restaurantPlaces >= 2 ? m.start_ranking() : m.dashboard_primary_action()}
			</Button>
		{/if}
	</article>
	<article class="surface-card dashboard-card">
		<div>
			<Icon icon={Compass} size={28} />
			<h2>{m.dashboard_recommendations_title()}</h2>
			<span class="status-chip">{m.dashboard_recommendations_locked()}</span>
			<p>{m.dashboard_recommendations_body()}</p>
		</div>
	</article>
	<article class="surface-card dashboard-card">
		<div>
			<Icon icon={BookOpenText} size={28} />
			<h2>{m.dashboard_reviews_title()}</h2>
			<p>{m.dashboard_reviews_body()}</p>
		</div>
		<Button href={localizeHref('/reviews/manage', { locale })} variant="secondary"
			>{m.manage_reviews()}</Button
		>
	</article>
</section>
