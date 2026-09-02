import { fail, isRedirect, redirect } from '@sveltejs/kit';
import type { ComparisonOutcome } from '$lib/domain/ranking/contracts';
import { deriveRankingProjection } from '$lib/domain/ranking/revision';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { ConflictError, DomainValidationError, NotFoundError } from '$lib/server/domain/errors';
import { requireUser } from '$lib/server/http/auth-guard';
import { localizedPath } from '$lib/server/http/locale';
import { ParticipationRepository } from '$lib/server/repositories/participation';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { stringField } from '$lib/server/security/auth-forms';
import { ProductAnalyticsService } from '$lib/server/services/product-analytics';
import { RankingService } from '$lib/server/services/rankings';
import type { Actions, PageServerLoad } from './$types';

const rankingRepository = new RankingRepository(db);
const rankings = new RankingService(
	rankingRepository,
	new ParticipationRepository(db),
	runtimeConfig.appEnvironment
);
const analytics = new ProductAnalyticsService(db);
const outcomes = new Set<ComparisonOutcome>(['left', 'right', 'tie', 'skip']);

function safeError(error: unknown) {
	if (
		error instanceof ConflictError ||
		error instanceof DomainValidationError ||
		error instanceof NotFoundError
	) {
		return error.message;
	}
	throw error;
}

function outcomeField(form: FormData) {
	const value = stringField(form, 'outcome') as ComparisonOutcome;
	if (!outcomes.has(value)) throw new DomainValidationError('Choose a valid comparison outcome');
	return value;
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const session = await rankingRepository.loadSession(user.id, event.params.sessionId);
	if (session.lifecycle === 'completed') {
		const revision = await rankingRepository.loadCurrentRevision(user.id, session.listId);
		const publishedEvidenceIds = new Set([
			...(revision?.activeEvidence.map((item) => item.id) ?? []),
			...(revision?.excludedEvidence.map((item) => item.evidence.id) ?? [])
		]);
		if (session.evidence.every((item) => publishedEvidenceIds.has(item.id))) {
			redirect(303, localizedPath('/ranking/restaurants'));
		}
		return {
			session: session.summary(),
			comparison: undefined,
			latestEvidenceId: undefined
		};
	}
	const places = await rankings.listVisitedPlaces(user.id, 'restaurant');
	const placeById = new Map(places.map((place) => [place.placeId, place]));
	const comparison = session.nextComparison();

	return {
		session: session.summary(),
		comparison: comparison
			? {
					...comparison,
					left: placeById.get(comparison.leftPlaceId),
					right: placeById.get(comparison.rightPlaceId)
				}
			: undefined,
		latestEvidenceId: session.latestActiveEvidence()?.id
	};
};

export const actions = {
	submit: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		try {
			const outcome = outcomeField(form);
			const result = await rankings.submit(
				user.id,
				event.params.sessionId,
				stringField(form, 'comparisonId'),
				outcome
			);
			if (result.captured) {
				const capture = await rankings.captureContext(user.id);
				await analytics.record({
					userId: user.id,
					cohortAssignmentId: capture.cohortAssignmentId,
					name: 'comparison-submitted',
					category: 'restaurant',
					metadata: {
						outcome,
						answeredCount: result.session.progress().answered,
						estimatedTotal: result.session.progress().estimatedTotal
					}
				});
			}
			if (result.session.lifecycle === 'completed') {
				const revision = await rankings.publishCompletedSession(
					user.id,
					event.params.sessionId,
					'restaurant'
				);
				const nextSession = await rankings.startNextUnplacedSession(user.id, result.session.listId);
				if (nextSession) {
					redirect(303, localizedPath(`/ranking/restaurants/session/${nextSession.id}`));
				}
				if (result.captured) {
					const capture = await rankings.captureContext(user.id);
					const projection = deriveRankingProjection(revision);
					await analytics.record({
						userId: user.id,
						cohortAssignmentId: capture.cohortAssignmentId,
						name: 'ranking-completed',
						category: 'restaurant',
						metadata: {
							orderCoverage: projection.orderCoverage,
							hasUnresolved: revision.unresolvedRelations.length > 0
						}
					});
				}
				redirect(303, `${localizedPath('/ranking/restaurants')}?completed=1`);
			}
			redirect(303, localizedPath(`/ranking/restaurants/session/${event.params.sessionId}`));
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(409, { section: 'comparison', error: safeError(error) });
		}
	},
	undo: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		try {
			const result = await rankings.undo(
				user.id,
				event.params.sessionId,
				stringField(form, 'evidenceId')
			);
			if (result.undone) {
				const capture = await rankings.captureContext(user.id);
				await analytics.record({
					userId: user.id,
					cohortAssignmentId: capture.cohortAssignmentId,
					name: 'comparison-undone',
					category: 'restaurant',
					metadata: { answeredCount: result.session.progress().answered }
				});
			}
			redirect(303, localizedPath(`/ranking/restaurants/session/${event.params.sessionId}`));
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(409, { section: 'comparison', error: safeError(error) });
		}
	},
	publish: async (event) => {
		const user = requireUser(event);
		try {
			const revision = await rankings.publishCompletedSession(
				user.id,
				event.params.sessionId,
				'restaurant'
			);
			const nextSession = await rankings.startNextUnplacedSession(user.id, revision.listId);
			redirect(
				303,
				nextSession
					? localizedPath(`/ranking/restaurants/session/${nextSession.id}`)
					: localizedPath('/ranking/restaurants')
			);
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(409, { section: 'publish', error: safeError(error) });
		}
	}
} satisfies Actions;
