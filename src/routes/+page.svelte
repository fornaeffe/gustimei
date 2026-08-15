<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { ArrowRight, Eye, Pause, Sparkles, UtensilsCrossed } from '@lucide/svelte';
	let locale = $derived(getLocale());
</script>

<svelte:head>
	<title>{m.product_name()} — {m.product_tagline()}</title>
	<meta name="description" content={m.product_tagline()} />
</svelte:head>

<section class="hero">
	<div class="hero__copy">
		<p class="eyebrow">{m.landing_eyebrow()}</p>
		<h1>{m.landing_heading_before()}<em>{m.landing_heading_emphasis()}</em></h1>
		<p class="lede">{m.landing_lede()}</p>
		<div class="cluster">
			<Button href={localizeHref('/auth/sign-up', { locale })}>
				{m.landing_cta()}
				<Icon icon={ArrowRight} size={18} />
			</Button>
			<Button href={localizeHref('/auth/sign-in', { locale })} variant="quiet">
				{m.landing_secondary_cta()}
			</Button>
		</div>
	</div>
	<div class="hero__demo" aria-label={m.landing_comparison_prompt()}>
		<div class="preference-card">
			<p class="eyebrow">{m.product_name()}</p>
			<p class="preference-card__question">{m.landing_comparison_prompt()}</p>
			<div class="preference-choice">
				<span><Icon icon={UtensilsCrossed} />{m.landing_choice_one()}</span>
				<span><Icon icon={UtensilsCrossed} />{m.landing_choice_two()}</span>
			</div>
			<p class="field__hint">{m.landing_tie()}</p>
		</div>
	</div>
</section>

<section class="principles" aria-labelledby="principles-heading">
	<p class="eyebrow">{m.product_name()}</p>
	<h2 id="principles-heading">{m.landing_principles_title()}</h2>
	<div class="principle-grid">
		<article class="principle-card">
			<Icon icon={Pause} />
			<h3>{m.landing_principle_control_title()}</h3>
			<p>{m.landing_principle_control_body()}</p>
		</article>
		<article class="principle-card">
			<Icon icon={Sparkles} />
			<h3>{m.landing_principle_feedback_title()}</h3>
			<p>{m.landing_principle_feedback_body()}</p>
		</article>
		<article class="principle-card">
			<Icon icon={Eye} />
			<h3>{m.landing_principle_trust_title()}</h3>
			<p>{m.landing_principle_trust_body()}</p>
		</article>
	</div>
</section>
