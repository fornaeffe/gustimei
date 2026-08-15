<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	let { body }: { body: string } = $props();
</script>

<section class="private-comment" aria-label={m.private_note_title()}>
	<strong>{m.private_note_title()}</strong>
	<p>{body}</p>
</section>
