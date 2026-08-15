<script lang="ts">
	import { Globe2, ShieldCheck } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';
	import Icon from '$lib/components/ui/Icon.svelte';
	let { compact = false }: { compact?: boolean } = $props();
</script>

<aside class="content-boundary content-boundary--public" aria-label={m.public_review_boundary()}>
	<Icon icon={compact ? Globe2 : ShieldCheck} size={20} />
	<div>
		<strong>{m.public_review_title()}</strong>
		<p>{compact ? m.not_independently_verified() : m.public_review_explanation()}</p>
	</div>
</aside>
