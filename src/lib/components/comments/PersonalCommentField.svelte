<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		value = $bindable(''),
		action = '?/saveComment',
		maxLength = 2000
	} = $props<{
		value?: string;
		action?: string;
		maxLength?: number;
	}>();
	let remaining = $derived(maxLength - value.length);
</script>

<form method="POST" {action} class="comment-field">
	<div class="content-boundary content-boundary--private">
		<strong>{m.private_note_title()}</strong>
		<p>{m.private_note_explanation()}</p>
	</div>
	<label for="personal-comment">{m.private_note_label()}</label>
	<textarea
		id="personal-comment"
		name="body"
		rows="5"
		maxlength={maxLength}
		bind:value
		aria-describedby="personal-comment-help personal-comment-count"></textarea>
	<p id="personal-comment-help" class="field__hint">{m.private_note_save_help()}</p>
	<div class="form-footer">
		<span id="personal-comment-count" aria-live="polite"
			>{m.characters_remaining({ count: remaining })}</span
		>
		<Button type="submit">{m.save_note()}</Button>
	</div>
</form>
