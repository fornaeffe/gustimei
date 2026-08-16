<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		value = $bindable(''),
		action = '?/saveComment',
		placeId,
		fieldId = 'personal-comment',
		maxLength = 2000
	} = $props<{
		value?: string;
		action?: string;
		placeId?: string;
		fieldId?: string;
		maxLength?: number;
	}>();
	let remaining = $derived(maxLength - value.length);
	let helpId = $derived(`${fieldId}-help`);
	let countId = $derived(`${fieldId}-count`);
</script>

<form method="POST" {action} class="comment-field">
	{#if placeId}<input type="hidden" name="placeId" value={placeId} />{/if}
	<div class="content-boundary content-boundary--private">
		<strong>{m.private_note_title()}</strong>
		<p>{m.private_note_explanation()}</p>
	</div>
	<label for={fieldId}>{m.private_note_label()}</label>
	<textarea
		id={fieldId}
		name="body"
		rows="5"
		maxlength={maxLength}
		bind:value
		aria-describedby={`${helpId} ${countId}`}></textarea>
	<p id={helpId} class="field__hint">{m.private_note_save_help()}</p>
	<div class="form-footer">
		<span id={countId} aria-live="polite">{m.characters_remaining({ count: remaining })}</span>
		<Button type="submit">{m.save_note()}</Button>
	</div>
</form>
