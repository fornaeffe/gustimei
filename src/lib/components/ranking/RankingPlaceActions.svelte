<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { ArrowDown, ArrowUp, RefreshCw } from '@lucide/svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		placeId,
		placeName,
		revisionId,
		moveUpEffect,
		moveDownEffect,
		canReposition,
		adjustAction,
		repositionAction,
		describedBy
	}: {
		placeId: string;
		placeName: string;
		revisionId: string;
		moveUpEffect?: 'merge' | 'split';
		moveDownEffect?: 'merge' | 'split';
		canReposition: boolean;
		adjustAction: string;
		repositionAction: string;
		describedBy: string;
	} = $props();

	function moveLabel(direction: 'up' | 'down', effect?: 'merge' | 'split') {
		if (direction === 'up') {
			return effect === 'merge'
				? m.move_up_merge({ place: placeName })
				: effect === 'split'
					? m.move_up_split({ place: placeName })
					: m.move_up_unavailable({ place: placeName });
		}
		return effect === 'merge'
			? m.move_down_merge({ place: placeName })
			: effect === 'split'
				? m.move_down_split({ place: placeName })
				: m.move_down_unavailable({ place: placeName });
	}

	let upLabel = $derived(moveLabel('up', moveUpEffect));
	let downLabel = $derived(moveLabel('down', moveDownEffect));
	let rerankLabel = $derived(
		canReposition
			? m.rerank_place({ place: placeName })
			: m.rerank_place_unavailable({ place: placeName })
	);

	const enhanceAdjustment: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				await goto(resolve(result.location as Pathname), {
					invalidateAll: true,
					noScroll: true,
					keepFocus: true
				});
				return;
			}
			await update();
		};
	};
</script>

<div
	class="ranked-place__actions"
	role="group"
	aria-label={m.ranking_actions_for({ place: placeName })}
	aria-describedby={describedBy}
>
	<form method="POST" action={adjustAction} use:enhance={enhanceAdjustment}>
		<input type="hidden" name="placeId" value={placeId} />
		<input type="hidden" name="revisionId" value={revisionId} />
		<input type="hidden" name="direction" value="up" />
		<button
			class="icon-button"
			type="submit"
			disabled={!moveUpEffect}
			aria-label={upLabel}
			title={upLabel}><Icon icon={ArrowUp} /></button
		>
	</form>
	<form method="POST" action={adjustAction} use:enhance={enhanceAdjustment}>
		<input type="hidden" name="placeId" value={placeId} />
		<input type="hidden" name="revisionId" value={revisionId} />
		<input type="hidden" name="direction" value="down" />
		<button
			class="icon-button"
			type="submit"
			disabled={!moveDownEffect}
			aria-label={downLabel}
			title={downLabel}><Icon icon={ArrowDown} /></button
		>
	</form>
	<form method="POST" action={repositionAction}>
		<input type="hidden" name="placeId" value={placeId} />
		<button
			class="icon-button"
			type="submit"
			disabled={!canReposition}
			aria-label={rerankLabel}
			title={rerankLabel}><Icon icon={RefreshCw} /></button
		>
	</form>
</div>
