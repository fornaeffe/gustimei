<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import Button from '$lib/components/ui/Button.svelte';
	let { versionId, action = '?/notice' }: { versionId: string; action?: string } = $props();
</script>

<form method="POST" {action} class="stack-form">
	<input type="hidden" name="versionId" value={versionId} />
	<div class="field">
		<label for="notice-kind">{m.notice_kind()}</label>
		<select id="notice-kind" name="kind" required>
			<option value="">{m.select_one()}</option>
			<option value="alleged-illegality">{m.notice_illegality()}</option>
			<option value="terms-or-policy">{m.notice_policy()}</option>
			<option value="authenticity">{m.notice_authenticity()}</option>
		</select>
	</div>
	<div class="field">
		<label for="notice-email">{m.contact_email()}</label>
		<input id="notice-email" name="email" type="email" autocomplete="email" required />
	</div>
	<div class="field">
		<label for="notice-explanation">{m.notice_explanation()}</label>
		<textarea id="notice-explanation" name="explanation" rows="6" required></textarea>
	</div>
	<label class="check-row"
		><input type="checkbox" name="ownerDelegate" value="true" />
		{m.owner_delegate_assertion()}</label
	>
	<Button type="submit">{m.submit_notice()}</Button>
</form>
