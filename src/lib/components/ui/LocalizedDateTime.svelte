<script lang="ts">
	import { getLocale } from '$lib/paraglide/runtime';

	let { value }: { value: Date | string } = $props();
	let locale = $derived(getLocale());
	let date = $derived(value instanceof Date ? value : new Date(value));
	let label = $derived(
		new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-GB', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'Europe/Rome'
		}).format(date)
	);
</script>

<time datetime={date.toISOString()} title={date.toISOString()}>{label}</time>
