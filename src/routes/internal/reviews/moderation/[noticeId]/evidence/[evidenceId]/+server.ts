import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http/auth-guard';
import { reviewModeration } from '$lib/server/services/review-moderation-runtime';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event, { verified: true });
	try {
		const file = await reviewModeration.readEvidenceFile({
			evidenceId: event.params.evidenceId,
			noticeId: event.params.noticeId,
			actorType: 'review_moderator',
			actorReference: user.id
		});
		return new Response(file.bytes.slice().buffer, {
			headers: {
				'cache-control': 'private, no-store',
				'content-disposition': `attachment; filename="case-evidence"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
				'content-type': file.mediaType,
				'x-content-type-options': 'nosniff'
			}
		});
	} catch {
		error(404, 'Evidence was not found');
	}
};
