<script lang="ts">
	import { CircleAlert, CircleCheck, Clock3 } from '@lucide/svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	let {
		state,
		title,
		description
	}: { state: 'pending' | 'restricted' | 'resolved'; title: string; description: string } =
		$props();
	let icon = $derived(
		state === 'resolved' ? CircleCheck : state === 'restricted' ? CircleAlert : Clock3
	);
</script>

<aside class="moderation-notice moderation-notice--{state}" role="status">
	<Icon {icon} />
	<div>
		<strong>{title}</strong>
		<p>{description}</p>
	</div>
</aside>
