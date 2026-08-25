<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import Button from '$lib/components/ui/Button.svelte';
	let { versionId, action = '?/notice' }: { versionId: string; action?: string } = $props();
</script>

<form method="POST" enctype="multipart/form-data" {action} class="stack-form">
	<input type="hidden" name="versionId" value={versionId} />
	<label class="check-row"
		><input type="checkbox" name="anonymous" value="true" />
		{m.anonymous_notice()}</label
	>
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
		<label for="notice-name">{m.notice_name()}</label>
		<input id="notice-name" name="name" autocomplete="name" />
	</div>
	<div class="field">
		<label for="notice-email">{m.contact_email()}</label>
		<input id="notice-email" name="email" type="email" autocomplete="email" />
	</div>
	<div class="field">
		<label for="notice-ground">{m.notice_ground()}</label>
		<input id="notice-ground" name="ground" minlength="3" maxlength="500" required />
	</div>
	<div class="field">
		<label for="notice-explanation">{m.notice_explanation()}</label>
		<textarea id="notice-explanation" name="explanation" rows="6" required></textarea>
	</div>
	<label class="check-row"
		><input type="checkbox" name="ownerDelegate" value="true" />
		{m.owner_delegate_assertion()}</label
	>
	<label class="check-row"
		><input type="checkbox" name="goodFaith" value="true" required />
		{m.good_faith_declaration()}</label
	>
	<div class="field">
		<label for="notice-evidence">{m.choose_evidence()}</label>
		<input
			id="notice-evidence"
			name="evidence"
			type="file"
			accept="application/pdf,image/jpeg,image/png,image/webp,text/plain"
		/>
		<p class="field__hint">{m.evidence_file_help()}</p>
	</div>
	<Button type="submit">{m.submit_notice()}</Button>
</form>
