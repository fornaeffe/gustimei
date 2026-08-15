<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import Button from '$lib/components/ui/Button.svelte';
	import DeclarationGroup from './DeclarationGroup.svelte';
	import ReviewDisclosure from './ReviewDisclosure.svelte';
	import ServiceDateInput from './ServiceDateInput.svelte';

	let {
		body = $bindable(''),
		serviceDate = '',
		action = '?/publish',
		ondismiss,
		errors = {},
		maxLength = 5000
	}: {
		body?: string;
		serviceDate?: string;
		action?: string;
		ondismiss?: () => void;
		errors?: { body?: string; serviceDate?: string; declarations?: string[] };
		maxLength?: number;
	} = $props();
	let remaining = $derived(maxLength - body.length);
</script>

<form method="POST" {action} class="review-composer">
	<ReviewDisclosure />
	<div class="field" class:field--invalid={Boolean(errors.body)}>
		<label for="review-body">{m.review_body_label()}</label>
		<p class="field__hint" id="review-body-help">{m.review_body_help()}</p>
		<textarea
			id="review-body"
			name="body"
			rows="8"
			maxlength={maxLength}
			bind:value={body}
			required
			aria-describedby="review-body-help review-body-count"
			aria-invalid={errors.body ? 'true' : undefined}></textarea>
		{#if errors.body}<p class="field__error">{errors.body}</p>{/if}
		<p id="review-body-count" class="character-count" aria-live="polite">
			{m.characters_remaining({ count: remaining })}
		</p>
	</div>
	<ServiceDateInput value={serviceDate} error={errors.serviceDate} />
	<DeclarationGroup errors={errors.declarations} />
	<div class="form-footer form-footer--end">
		<Button variant="quiet" type="button" onclick={ondismiss}>{m.not_now()}</Button>
		<Button type="submit">{m.publish_review()}</Button>
	</div>
</form>
