import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http/auth-guard';
import { reviewModeration } from '$lib/server/services/review-moderation-runtime';
import type { RequestHandler } from './$types';

function downloadHeaders(mediaType: string, filename: string) {
	return {
		'cache-control': 'private, no-store',
		'content-disposition': `attachment; filename="case-evidence"; filename*=UTF-8''${encodeURIComponent(filename)}`,
		'content-type': mediaType,
		'x-content-type-options': 'nosniff'
	};
}

export const GET: RequestHandler = async (event) => {
	const token = event.url.searchParams.get('token') || undefined;
	try {
		const file = await reviewModeration.readEvidenceFile({
			evidenceId: event.params.evidenceId,
			noticeId: event.params.noticeId,
			actorType: token ? 'notifier' : 'author',
			actorReference: token
				? `notifier-case:${event.params.noticeId}`
				: requireUser(event, { verified: true }).id,
			notifierToken: token
		});
		return new Response(file.bytes.slice().buffer, {
			headers: downloadHeaders(file.mediaType, file.filename)
		});
	} catch {
		error(404, 'Evidence was not found');
	}
};
