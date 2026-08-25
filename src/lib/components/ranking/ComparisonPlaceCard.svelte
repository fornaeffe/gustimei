<script lang="ts">
	import { enhance } from '$app/forms';
	import { Hotel, MapPin, StickyNote, UtensilsCrossed } from '@lucide/svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		place,
		comparisonId,
		outcome,
		disabled = false,
		onpending = () => {},
		onsettled = () => {}
	}: {
		place: {
			name: string;
			category: 'restaurant' | 'hotel';
			displayLocality: string;
			addressLabel: string | null;
			commentBody: string | null;
		};
		comparisonId: string;
		outcome: 'left' | 'right';
		disabled?: boolean;
		onpending?: () => void;
		onsettled?: () => void;
	} = $props();
</script>

<article class="comparison-place">
	<form
		method="POST"
		action="?/submit"
		use:enhance={() => {
			onpending();
			return async ({ update }) => {
				await update();
				onsettled();
			};
		}}
	>
		<input type="hidden" name="comparisonId" value={comparisonId} />
		<input type="hidden" name="outcome" value={outcome} />
		<button
			type="submit"
			class="comparison-place__choice place-card place-card--{place.category}"
			{disabled}
			aria-label={m.prefer_place({ place: place.name })}
		>
			<span class="place-card__media" aria-hidden="true">
				<Icon icon={place.category === 'restaurant' ? UtensilsCrossed : Hotel} size={52} />
				<span>{place.category === 'restaurant' ? m.restaurant() : m.hotel()}</span>
			</span>
			<span class="place-card__body">
				<strong>{place.name}</strong>
				<span class="place-card__location">
					<Icon icon={MapPin} size={16} />{place.displayLocality}
				</span>
				{#if place.addressLabel}<small>{place.addressLabel}</small>{/if}
				<span class="comparison-place__select">{m.prefer_place({ place: place.name })}</span>
			</span>
		</button>
	</form>
	{#if place.commentBody}
		<details class="comparison-place__note">
			<summary><Icon icon={StickyNote} size={16} />{m.view_private_note()}</summary>
			<p>{place.commentBody}</p>
			<small>{m.private_note_explanation()}</small>
		</details>
	{/if}
</article>
