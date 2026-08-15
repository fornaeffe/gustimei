<script lang="ts">
	let { value, max = 100, label }: { value: number; max?: number; label: string } = $props();
	let safeValue = $derived(Math.min(Math.max(value, 0), max));
	let percentage = $derived(max > 0 ? Math.round((safeValue / max) * 100) : 0);
</script>

<div class="progress-block">
	<div class="progress-block__label"><span>{label}</span><span>{percentage}%</span></div>
	<progress value={safeValue} {max}>{percentage}%</progress>
</div>
