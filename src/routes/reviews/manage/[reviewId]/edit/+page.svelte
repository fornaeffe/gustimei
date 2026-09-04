<script lang="ts">
	import DeclarationGroup from '$lib/components/reviews/DeclarationGroup.svelte';
	import ReviewDisclosure from '$lib/components/reviews/ReviewDisclosure.svelte';
	import ServiceDateInput from '$lib/components/reviews/ServiceDateInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormFeedback from '$lib/components/ui/FormFeedback.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data, form } = $props();
</script>

<svelte:head><title>{m.edit_review()} — {m.product_name()}</title></svelte:head>
<div class="stack narrow-content">
	<header>
		<p class="eyebrow">{m.public_review_title()}</p>
		<h1>{m.edit_review()}</h1>
		<p>{data.review.placeName ?? data.review.placeId}</p>
	</header>
	<ReviewDisclosure />
	<section class="surface-card stack">
		<h2>{m.edit_same_visit()}</h2>
		<p>{m.edit_same_visit_help()}</p>
		<FormFeedback active={form?.section === 'edit'} error={form?.error} />
		<form method="POST" action="?/edit" class="review-composer">
			<input type="hidden" name="expectedVersion" value={data.review.version} />
			<div class="field">
				<label for="edit-body">{m.review_body_label()}</label>
				<textarea id="edit-body" name="body" rows="8" maxlength="2000" required
					>{data.review.body}</textarea
				>
			</div>
			<DeclarationGroup />
			<Button type="submit">{m.edit_review()}</Button>
		</form>
	</section>
	<section class="surface-card stack">
		<h2>{m.substitute_review()}</h2>
		<p>{m.substitute_review_help()}</p>
		<FormFeedback active={form?.section === 'substitute'} error={form?.error} />
		<form method="POST" action="?/substitute" class="review-composer">
			<div class="field">
				<label for="substitute-body">{m.review_body_label()}</label>
				<textarea id="substitute-body" name="body" rows="8" maxlength="2000" required></textarea>
			</div>
			<ServiceDateInput />
			<DeclarationGroup />
			<Button type="submit">{m.substitute_review()}</Button>
		</form>
	</section>
</div>
