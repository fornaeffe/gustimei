<script lang="ts">
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head>
	<title>{m.product_name()}</title>
	<meta name="description" content={m.product_tagline()} />
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
	<p class="text-sm font-semibold tracking-widest text-amber-700 uppercase">{m.product_name()}</p>
	<h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
		{m.product_tagline()}
	</h1>
	<p class="max-w-2xl text-lg leading-8 text-stone-600">{m.phase_zero_status()}</p>
</main>
