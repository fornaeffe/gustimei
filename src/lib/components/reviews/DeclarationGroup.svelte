<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	let { errors = [] }: { errors?: string[] } = $props();
</script>

<fieldset
	class="declaration-group"
	aria-describedby={errors.length ? 'declaration-errors' : undefined}
>
	<legend>{m.review_declarations_legend()}</legend>
	<label
		><input type="checkbox" name="usedService" value="true" required />
		{m.declaration_used_service()}</label
	>
	<label
		><input type="checkbox" name="relevant" value="true" required />
		{m.declaration_relevant()}</label
	>
	<label
		><input type="checkbox" name="notIncentivized" value="true" required />
		{m.declaration_not_incentivized()}</label
	>
	{#if errors.length}
		<ul id="declaration-errors" class="field__error">
			{#each errors as error (error)}<li>{error}</li>{/each}
		</ul>
	{/if}
</fieldset>
