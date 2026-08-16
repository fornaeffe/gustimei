<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	let { value = $bindable(''), error }: { value?: string; error?: string } = $props();
</script>

<div class="field" class:field--invalid={Boolean(error)}>
	<label for="service-date">{m.service_date()}</label>
	<p class="field__hint" id="service-date-help">{m.service_date_help()}</p>
	<input
		id="service-date"
		name="serviceDate"
		type="date"
		bind:value
		required
		aria-describedby="service-date-help"
		aria-invalid={error ? 'true' : undefined}
	/>
	{#if error}<p class="field__error">{error}</p>{/if}
</div>
