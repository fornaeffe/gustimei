import {
	RANKING_ENGINE_VERSION,
	type ComparisonEvidence,
	type EquivalenceTier,
	type ExcludedEvidence,
	type ExclusionReason,
	type ManualPlacementDestination,
	type ManualPlacementEvidence,
	type PlaceId,
	type RankingDirection,
	type RankingProjection,
	type RankingRevision,
	type RankingSessionSummary,
	type RepairRequirement,
	type UnresolvedRelation
} from './contracts';

interface RevisionInput {
	id: string;
	listId: string;
	category: RankingRevision['category'];
	revision: number;
	activePlaceIds: readonly PlaceId[];
	evidence: readonly ComparisonEvidence[];
	provenance: RankingRevision['provenance'];
	publishedAt: string;
	invalidatedEvidenceIds?: readonly string[];
}

interface PlacedRevisionInput extends RevisionInput {
	orderedTiers: readonly EquivalenceTier[];
	unresolvedRelations: readonly UnresolvedRelation[];
	invalidatedEvidenceIds?: readonly string[];
	manualPlacement?: ManualPlacementEvidence;
}

export interface ManualPlacementPlan {
	readonly orderedTiers: readonly EquivalenceTier[];
	readonly destination: ManualPlacementEvidence['destination'];
	readonly upperTierPlaceIds: readonly PlaceId[];
	readonly lowerTierPlaceIds: readonly PlaceId[];
	readonly tiedTierPlaceIds: readonly PlaceId[];
	readonly retiredComparisonEvidenceIds: readonly string[];
}

export interface AdjacentTierAdjustment {
	direction: RankingDirection;
	effect: 'merge' | 'split';
	comparisonPlaceId: PlaceId;
	orderedTiers: readonly EquivalenceTier[];
}

class DisjointSet {
	readonly #parent = new Map<PlaceId, PlaceId>();

	constructor(items: readonly PlaceId[]) {
		for (const item of items) this.#parent.set(item, item);
	}

	find(item: PlaceId): PlaceId {
		const parent = this.#parent.get(item);
		if (parent === undefined) throw new Error(`Unknown ranking item: ${item}`);
		if (parent === item) return item;
		const root = this.find(parent);
		this.#parent.set(item, root);
		return root;
	}

	union(first: PlaceId, second: PlaceId) {
		const firstRoot = this.find(first);
		const secondRoot = this.find(second);
		if (firstRoot === secondRoot) return;
		const [root, child] = [firstRoot, secondRoot].sort();
		this.#parent.set(child, root);
	}
}

interface ConsistencyResult {
	consistent: boolean;
	reason?: Extract<ExclusionReason, 'cycle' | 'tie-conflict'>;
	conflictingEvidenceIds: string[];
}

function strictDirection(evidence: ComparisonEvidence): readonly [PlaceId, PlaceId] | undefined {
	if (evidence.outcome === 'left') return [evidence.leftPlaceId, evidence.rightPlaceId];
	if (evidence.outcome === 'right') return [evidence.rightPlaceId, evidence.leftPlaceId];
	return undefined;
}

function checkConsistency(
	items: readonly PlaceId[],
	evidence: readonly ComparisonEvidence[]
): ConsistencyResult {
	const ties = new DisjointSet(items);
	for (const item of evidence) {
		if (item.outcome === 'tie') ties.union(item.leftPlaceId, item.rightPlaceId);
	}

	for (const item of evidence) {
		const direction = strictDirection(item);
		if (direction && ties.find(direction[0]) === ties.find(direction[1])) {
			return {
				consistent: false,
				reason: 'tie-conflict',
				conflictingEvidenceIds: evidence
					.filter(
						(candidate) =>
							candidate.id === item.id ||
							(candidate.outcome === 'tie' &&
								ties.find(candidate.leftPlaceId) === ties.find(direction[0]) &&
								ties.find(candidate.rightPlaceId) === ties.find(direction[0]))
					)
					.map((candidate) => candidate.id)
			};
		}
	}

	const edges = new Map<PlaceId, Map<PlaceId, string>>();
	for (const item of evidence) {
		const direction = strictDirection(item);
		if (!direction) continue;
		const preferred = ties.find(direction[0]);
		const other = ties.find(direction[1]);
		const outgoing = edges.get(preferred) ?? new Map<PlaceId, string>();
		outgoing.set(other, item.id);
		edges.set(preferred, outgoing);
	}

	const visiting = new Set<PlaceId>();
	const visited = new Set<PlaceId>();
	const pathEvidence: string[] = [];
	const visit = (node: PlaceId): string[] | undefined => {
		if (visiting.has(node)) return [...pathEvidence];
		if (visited.has(node)) return undefined;
		visiting.add(node);
		for (const [next, evidenceId] of edges.get(node) ?? []) {
			pathEvidence.push(evidenceId);
			const cycle = visit(next);
			if (cycle) return cycle;
			pathEvidence.pop();
		}
		visiting.delete(node);
		visited.add(node);
		return undefined;
	};

	for (const item of items) {
		const cycle = visit(ties.find(item));
		if (cycle) {
			return { consistent: false, reason: 'cycle', conflictingEvidenceIds: [...new Set(cycle)] };
		}
	}

	return { consistent: true, conflictingEvidenceIds: [] };
}

function selectConsistentEvidence(
	items: readonly PlaceId[],
	evidence: readonly ComparisonEvidence[]
): { active: ComparisonEvidence[]; excluded: ExcludedEvidence[] } {
	const supersededIds = new Set(
		evidence
			.filter((item) => item.active && item.supersedesEvidenceId)
			.map((item) => item.supersedesEvidenceId as string)
	);
	const inactive = evidence
		.filter((item) => !item.active)
		.map((item) => ({ evidence: item, reason: 'undone' as const, conflictingEvidenceIds: [] }));
	const superseded = evidence
		.filter((item) => item.active && supersededIds.has(item.id))
		.map((item) => ({
			evidence: item,
			reason: 'superseded' as const,
			conflictingEvidenceIds: evidence
				.filter((candidate) => candidate.supersedesEvidenceId === item.id)
				.map((candidate) => candidate.id)
		}));
	const candidates = evidence
		.filter((item) => item.active && item.outcome !== 'skip' && !supersededIds.has(item.id))
		.sort((first, second) => second.sequence - first.sequence || second.id.localeCompare(first.id));
	const skipped = evidence.filter(
		(item) => item.active && item.outcome === 'skip' && !supersededIds.has(item.id)
	);
	const active: ComparisonEvidence[] = [];
	const excluded: ExcludedEvidence[] = [...inactive, ...superseded];

	for (const candidate of candidates) {
		const trial = [...active, candidate];
		const result = checkConsistency(items, trial);
		if (result.consistent) active.push(candidate);
		else {
			excluded.push({
				evidence: candidate,
				reason: candidate.outcome === 'tie' ? 'tie-conflict' : (result.reason ?? 'cycle'),
				conflictingEvidenceIds: result.conflictingEvidenceIds.filter((id) => id !== candidate.id)
			});
		}
	}

	return {
		active: [...active, ...skipped].sort((first, second) => first.sequence - second.sequence),
		excluded: excluded.sort((first, second) => first.evidence.sequence - second.evidence.sequence)
	};
}

function transitiveClosure(nodes: readonly PlaceId[], edges: ReadonlyMap<PlaceId, Set<PlaceId>>) {
	const reachable = new Map<PlaceId, Set<PlaceId>>();
	for (const node of nodes) reachable.set(node, new Set(edges.get(node) ?? []));
	for (const through of nodes) {
		for (const from of nodes) {
			if (!reachable.get(from)?.has(through)) continue;
			for (const to of reachable.get(through) ?? []) reachable.get(from)?.add(to);
		}
	}
	return reachable;
}

function deriveOrder(
	items: readonly PlaceId[],
	activeEvidence: readonly ComparisonEvidence[],
	allEvidence: readonly ComparisonEvidence[],
	excluded: readonly ExcludedEvidence[]
): { tiers: EquivalenceTier[]; unresolved: UnresolvedRelation[] } {
	const ties = new DisjointSet(items);
	for (const evidence of activeEvidence) {
		if (evidence.outcome === 'tie') ties.union(evidence.leftPlaceId, evidence.rightPlaceId);
	}

	const members = new Map<PlaceId, PlaceId[]>();
	for (const item of items) {
		const root = ties.find(item);
		members.set(root, [...(members.get(root) ?? []), item].sort());
	}
	const roots = [...members.keys()].sort();
	const edges = new Map<PlaceId, Set<PlaceId>>();
	for (const evidence of activeEvidence) {
		const direction = strictDirection(evidence);
		if (!direction) continue;
		const from = ties.find(direction[0]);
		const to = ties.find(direction[1]);
		if (from !== to) edges.set(from, new Set([...(edges.get(from) ?? []), to]));
	}
	const reachable = transitiveClosure(roots, edges);
	const indegree = new Map(roots.map((root) => [root, 0]));
	for (const targets of edges.values()) {
		for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
	}
	const queue = roots.filter((root) => indegree.get(root) === 0).sort();
	const orderedRoots: PlaceId[] = [];
	while (queue.length > 0) {
		const root = queue.shift();
		if (root === undefined) break;
		orderedRoots.push(root);
		for (const target of edges.get(root) ?? []) {
			const next = (indegree.get(target) ?? 0) - 1;
			indegree.set(target, next);
			if (next === 0) {
				queue.push(target);
				queue.sort();
			}
		}
	}

	const contradictionPairs = new Set<string>();
	for (const item of excluded) {
		if (item.reason === 'cycle' || item.reason === 'tie-conflict') {
			contradictionPairs.add(pairKey(item.evidence.leftPlaceId, item.evidence.rightPlaceId));
		}
	}
	const skippedPairs = new Set(
		allEvidence
			.filter((item) => item.active && item.outcome === 'skip')
			.map((item) => pairKey(item.leftPlaceId, item.rightPlaceId))
	);
	const unresolved: UnresolvedRelation[] = [];
	for (let firstIndex = 0; firstIndex < roots.length; firstIndex += 1) {
		for (let secondIndex = firstIndex + 1; secondIndex < roots.length; secondIndex += 1) {
			const firstRoot = roots[firstIndex];
			const secondRoot = roots[secondIndex];
			if (reachable.get(firstRoot)?.has(secondRoot) || reachable.get(secondRoot)?.has(firstRoot)) {
				continue;
			}
			for (const first of members.get(firstRoot) ?? []) {
				for (const second of members.get(secondRoot) ?? []) {
					const key = pairKey(first, second);
					unresolved.push({
						firstPlaceId: first,
						secondPlaceId: second,
						reason: contradictionPairs.has(key)
							? 'contradiction'
							: skippedPairs.has(key)
								? 'skipped'
								: 'missing-evidence'
					});
				}
			}
		}
	}

	return {
		tiers: orderedRoots.map((root) => ({ placeIds: members.get(root) ?? [] })),
		unresolved
	};
}

function pairKey(first: PlaceId, second: PlaceId) {
	return [first, second].sort().join('\u0000');
}

function tierIndexByPlace(tiers: readonly EquivalenceTier[]) {
	return new Map(
		tiers.flatMap((tier, tierIndex) =>
			tier.placeIds.map((placeId) => [placeId, tierIndex] as const)
		)
	);
}

function equalTiers(first: readonly EquivalenceTier[], second: readonly EquivalenceTier[]) {
	return (
		first.length === second.length &&
		first.every(
			(tier, index) =>
				tier.placeIds.length === second[index].placeIds.length &&
				tier.placeIds.every((placeId) => second[index].placeIds.includes(placeId))
		)
	);
}

function evidenceMatchesTiers(
	evidence: ComparisonEvidence,
	tierIndexes: ReadonlyMap<PlaceId, number>
) {
	if (evidence.outcome === 'skip') return true;
	const leftTier = tierIndexes.get(evidence.leftPlaceId);
	const rightTier = tierIndexes.get(evidence.rightPlaceId);
	if (leftTier === undefined || rightTier === undefined) return false;
	if (evidence.outcome === 'tie') return leftTier === rightTier;
	return evidence.outcome === 'left' ? leftTier < rightTier : rightTier < leftTier;
}

export function incompatibleEvidenceIdsForTiers(
	evidence: readonly ComparisonEvidence[],
	tiers: readonly EquivalenceTier[]
) {
	const tierIndexes = tierIndexByPlace(tiers);
	return evidence.filter((item) => !evidenceMatchesTiers(item, tierIndexes)).map((item) => item.id);
}

/**
 * Applies a direct placement to a fully resolved tier sequence. A boundary index refers to the
 * visible base sequence (0 is before the first tier and length is after the last tier). Removing a
 * singleton source tier shifts later boundaries left by one. The returned snapshots are the
 * canonical semantics of the operation; crossed places do not become synthetic comparisons.
 */
export function planManualPlacement(
	revision: RankingRevision,
	placeId: PlaceId,
	destination: ManualPlacementDestination
): ManualPlacementPlan {
	if (revision.unresolvedRelations.length > 0 || deriveRepairRequirement(revision)) {
		throw new Error('Manual placement requires a fully resolved ranking');
	}
	const sourceTierIndex = revision.orderedTiers.findIndex((tier) =>
		tier.placeIds.includes(placeId)
	);
	if (sourceTierIndex < 0) throw new Error('The moved place is not part of the ranking');
	const sourceTierWasSingleton = revision.orderedTiers[sourceTierIndex].placeIds.length === 1;
	const tiers = revision.orderedTiers
		.map((tier) => ({ placeIds: tier.placeIds.filter((item) => item !== placeId).sort() }))
		.filter((tier) => tier.placeIds.length > 0);

	let placementDestination: ManualPlacementEvidence['destination'];
	let upperTierPlaceIds: readonly PlaceId[] = [];
	let lowerTierPlaceIds: readonly PlaceId[] = [];
	let tiedTierPlaceIds: readonly PlaceId[] = [];
	if (destination.type === 'boundary') {
		if (
			!Number.isInteger(destination.boundaryIndex) ||
			destination.boundaryIndex < 0 ||
			destination.boundaryIndex > revision.orderedTiers.length
		) {
			throw new Error('The placement boundary is invalid');
		}
		const shiftedIndex =
			destination.boundaryIndex -
			(sourceTierWasSingleton && sourceTierIndex < destination.boundaryIndex ? 1 : 0);
		const insertionIndex = Math.max(0, Math.min(tiers.length, shiftedIndex));
		tiers.splice(insertionIndex, 0, { placeIds: [placeId] });
		placementDestination = 'between-tiers';
		upperTierPlaceIds = tiers[insertionIndex - 1]?.placeIds ?? [];
		lowerTierPlaceIds = tiers[insertionIndex + 1]?.placeIds ?? [];
	} else {
		if (
			!Number.isInteger(destination.tierIndex) ||
			destination.tierIndex < 0 ||
			destination.tierIndex >= revision.orderedTiers.length ||
			destination.tierIndex === sourceTierIndex
		) {
			throw new Error('The destination tier is invalid');
		}
		const shiftedIndex =
			destination.tierIndex -
			(sourceTierWasSingleton && sourceTierIndex < destination.tierIndex ? 1 : 0);
		const target = tiers[shiftedIndex];
		if (!target) throw new Error('The destination tier is invalid');
		tiedTierPlaceIds = [...target.placeIds];
		target.placeIds = [...target.placeIds, placeId].sort();
		placementDestination = 'into-tier';
	}

	if (equalTiers(tiers, revision.orderedTiers)) {
		throw new Error('Choose a different ranking position');
	}
	const allEvidence = [
		...revision.activeEvidence,
		...revision.excludedEvidence.map((item) => item.evidence)
	];
	return {
		orderedTiers: tiers,
		destination: placementDestination,
		upperTierPlaceIds,
		lowerTierPlaceIds,
		tiedTierPlaceIds,
		retiredComparisonEvidenceIds: incompatibleEvidenceIdsForTiers(allEvidence, tiers)
	};
}

export function planAdjacentTierAdjustment(
	revision: RankingRevision,
	placeId: PlaceId,
	direction: RankingDirection
): AdjacentTierAdjustment | undefined {
	const tierIndex = revision.orderedTiers.findIndex((tier) => tier.placeIds.includes(placeId));
	if (tierIndex < 0) return undefined;
	const currentTier = revision.orderedTiers[tierIndex];
	const unresolvedPlaces = new Set(
		revision.unresolvedRelations.flatMap((relation) => [
			relation.firstPlaceId,
			relation.secondPlaceId
		])
	);
	const repairPlaces = new Set(deriveRepairRequirement(revision)?.placeIds ?? []);

	if (currentTier.placeIds.length > 1) {
		const remaining = currentTier.placeIds.filter((item) => item !== placeId).sort();
		if (
			[placeId, ...remaining].some((item) => unresolvedPlaces.has(item) || repairPlaces.has(item))
		) {
			return undefined;
		}
		const tiers = revision.orderedTiers.map((tier) => ({ placeIds: [...tier.placeIds] }));
		tiers.splice(
			tierIndex,
			1,
			...(direction === 'up'
				? [{ placeIds: [placeId] }, { placeIds: remaining }]
				: [{ placeIds: remaining }, { placeIds: [placeId] }])
		);
		return {
			direction,
			effect: 'split',
			comparisonPlaceId: remaining[0],
			orderedTiers: tiers
		};
	}

	const destinationIndex = direction === 'up' ? tierIndex - 1 : tierIndex + 1;
	const destination = revision.orderedTiers[destinationIndex];
	if (!destination) return undefined;
	if (
		[placeId, ...destination.placeIds].some(
			(item) => unresolvedPlaces.has(item) || repairPlaces.has(item)
		)
	) {
		return undefined;
	}
	const merged = [...destination.placeIds, placeId].sort();
	const tiers = revision.orderedTiers
		.filter((_tier, index) => index !== tierIndex)
		.map((tier, index) => ({
			placeIds: index === Math.min(tierIndex, destinationIndex) ? merged : [...tier.placeIds]
		}));
	return {
		direction,
		effect: 'merge',
		comparisonPlaceId: [...destination.placeIds].sort()[0],
		orderedTiers: tiers
	};
}

export function createRankingRevision(input: RevisionInput): RankingRevision {
	const items = [...new Set(input.activePlaceIds)];
	if (items.length !== input.activePlaceIds.length) throw new Error('Ranking items must be unique');
	if (!Number.isInteger(input.revision) || input.revision < 1) {
		throw new Error('Ranking revision numbers must be positive integers');
	}
	const itemSet = new Set(items);
	const evidenceIds = new Set<string>();
	const evidenceSequences = new Set<number>();
	for (const evidence of input.evidence) {
		if (evidenceIds.has(evidence.id)) throw new Error('Comparison evidence IDs must be unique');
		evidenceIds.add(evidence.id);
		if (!Number.isInteger(evidence.sequence) || evidence.sequence < 1) {
			throw new Error('Comparison evidence sequences must be positive integers');
		}
		if (evidenceSequences.has(evidence.sequence)) {
			throw new Error('Comparison evidence sequences must be unique within a revision');
		}
		evidenceSequences.add(evidence.sequence);
		if (evidence.leftPlaceId === evidence.rightPlaceId) {
			throw new Error('A comparison requires two different places');
		}
		const canonicalPair = [evidence.leftPlaceId, evidence.rightPlaceId].sort();
		if (
			evidence.logicalPair[0] !== canonicalPair[0] ||
			evidence.logicalPair[1] !== canonicalPair[1]
		) {
			throw new Error('Logical comparison pairs must be canonical and presentation-independent');
		}
		if (!itemSet.has(evidence.leftPlaceId) || !itemSet.has(evidence.rightPlaceId)) {
			throw new Error('Comparison evidence must reference active ranking items');
		}
	}
	for (const evidence of input.evidence) {
		if (evidence.supersedesEvidenceId && !evidenceIds.has(evidence.supersedesEvidenceId)) {
			throw new Error('Superseded evidence must exist in the revision history');
		}
		if (evidence.supersedesEvidenceId === evidence.id) {
			throw new Error('Comparison evidence cannot supersede itself');
		}
	}

	const invalidatedIds = new Set(input.invalidatedEvidenceIds ?? []);
	for (const evidenceId of invalidatedIds) {
		if (!input.evidence.some((item) => item.id === evidenceId)) {
			throw new Error('Invalidated evidence must exist in the revision history');
		}
	}
	const selected = selectConsistentEvidence(
		items,
		input.evidence.filter((item) => !invalidatedIds.has(item.id))
	);
	const invalidated: ExcludedEvidence[] = input.evidence
		.filter((item) => invalidatedIds.has(item.id))
		.map((evidence) => ({ evidence, reason: 'invalidated', conflictingEvidenceIds: [] }));
	const order = deriveOrder(items, selected.active, input.evidence, selected.excluded);
	return {
		id: input.id,
		listId: input.listId,
		category: input.category,
		revision: input.revision,
		activePlaceIds: items,
		orderedTiers: order.tiers,
		unresolvedRelations: order.unresolved,
		activeEvidence: selected.active,
		excludedEvidence: [...selected.excluded, ...invalidated].sort(
			(first, second) => first.evidence.sequence - second.evidence.sequence
		),
		rankingEngineVersion: RANKING_ENGINE_VERSION,
		provenance: input.provenance,
		publishedAt: input.publishedAt
	};
}

export function createPlacedRankingRevision(input: PlacedRevisionInput): RankingRevision {
	// Reuse the comparison-history validation performed for ordinary derived revisions.
	createRankingRevision(input);
	const items = [...new Set(input.activePlaceIds)];
	const tierPlaceIds = input.orderedTiers.flatMap((tier) => tier.placeIds);
	if (
		tierPlaceIds.length !== items.length ||
		new Set(tierPlaceIds).size !== items.length ||
		items.some((placeId) => !tierPlaceIds.includes(placeId)) ||
		input.orderedTiers.some((tier) => tier.placeIds.length === 0)
	) {
		throw new Error('Placed ranking tiers must partition the active places exactly once');
	}
	const invalidatedIds = new Set(input.invalidatedEvidenceIds ?? []);
	for (const evidenceId of invalidatedIds) {
		if (!input.evidence.some((item) => item.id === evidenceId)) {
			throw new Error('Invalidated evidence must exist in the revision history');
		}
	}
	const selected = selectConsistentEvidence(
		items,
		input.evidence.filter((item) => !invalidatedIds.has(item.id))
	);
	const tierIndexes = tierIndexByPlace(input.orderedTiers);
	if (selected.active.some((item) => !evidenceMatchesTiers(item, tierIndexes))) {
		throw new Error('Active comparison evidence contradicts the placed ranking tiers');
	}
	for (const relation of input.unresolvedRelations) {
		if (
			relation.firstPlaceId === relation.secondPlaceId ||
			!tierIndexes.has(relation.firstPlaceId) ||
			!tierIndexes.has(relation.secondPlaceId) ||
			tierIndexes.get(relation.firstPlaceId) === tierIndexes.get(relation.secondPlaceId)
		) {
			throw new Error('Placed unresolved relations must connect distinct active tiers');
		}
	}
	const invalidated: ExcludedEvidence[] = input.evidence
		.filter((item) => invalidatedIds.has(item.id))
		.map((evidence) => ({ evidence, reason: 'invalidated', conflictingEvidenceIds: [] }));
	return {
		id: input.id,
		listId: input.listId,
		category: input.category,
		revision: input.revision,
		activePlaceIds: items,
		orderedTiers: input.orderedTiers.map((tier) => ({ placeIds: [...tier.placeIds] })),
		unresolvedRelations: input.unresolvedRelations.map((relation) => ({ ...relation })),
		activeEvidence: selected.active,
		excludedEvidence: [...selected.excluded, ...invalidated].sort(
			(first, second) => first.evidence.sequence - second.evidence.sequence
		),
		...(input.manualPlacement
			? {
					manualPlacement: {
						...input.manualPlacement,
						upperTierPlaceIds: [...input.manualPlacement.upperTierPlaceIds],
						lowerTierPlaceIds: [...input.manualPlacement.lowerTierPlaceIds],
						tiedTierPlaceIds: [...input.manualPlacement.tiedTierPlaceIds],
						retiredComparisonEvidenceIds: [...input.manualPlacement.retiredComparisonEvidenceIds]
					}
				}
			: {}),
		rankingEngineVersion: RANKING_ENGINE_VERSION,
		provenance: input.provenance,
		publishedAt: input.publishedAt
	};
}

export function deriveRepairRequirement(revision: RankingRevision): RepairRequirement | undefined {
	const conflicts = revision.excludedEvidence.filter(
		(item) => item.reason === 'cycle' || item.reason === 'tie-conflict'
	);
	if (conflicts.length === 0) return undefined;
	const placeIds = [
		...new Set(conflicts.flatMap((item) => [item.evidence.leftPlaceId, item.evidence.rightPlaceId]))
	].sort();
	const tierCount = revision.orderedTiers.length;
	const localLimit = Math.max(5, Math.ceil(tierCount * 0.25));
	return {
		placeIds,
		evidenceIds: conflicts.map((item) => item.evidence.id).sort(),
		reason: conflicts.some((item) => item.reason === 'tie-conflict') ? 'tie-conflict' : 'cycle',
		scope: placeIds.length > localLimit ? 'rebuild' : 'local'
	};
}

export function deriveRankingDisplay(revision: RankingRevision): {
	orderedTiers: EquivalenceTier[];
	unresolvedPlaceGroups: PlaceId[][];
} {
	const unresolvedPairs = new Set(
		revision.unresolvedRelations.map((relation) =>
			pairKey(relation.firstPlaceId, relation.secondPlaceId)
		)
	);
	const tiersAreComparable = (first: EquivalenceTier, second: EquivalenceTier) =>
		first.placeIds.every((firstPlaceId) =>
			second.placeIds.every(
				(secondPlaceId) => !unresolvedPairs.has(pairKey(firstPlaceId, secondPlaceId))
			)
		);
	const bestEndingAt: { placeCount: number; tierIndexes: number[] }[] = [];
	for (const [tierIndex, tier] of revision.orderedTiers.entries()) {
		let best = { placeCount: tier.placeIds.length, tierIndexes: [tierIndex] };
		for (let previousIndex = 0; previousIndex < tierIndex; previousIndex += 1) {
			if (!tiersAreComparable(revision.orderedTiers[previousIndex], tier)) continue;
			const previous = bestEndingAt[previousIndex];
			const candidate = {
				placeCount: previous.placeCount + tier.placeIds.length,
				tierIndexes: [...previous.tierIndexes, tierIndex]
			};
			if (candidate.placeCount > best.placeCount) best = candidate;
		}
		bestEndingAt.push(best);
	}
	const best = bestEndingAt.reduce(
		(current, candidate) => (candidate.placeCount > current.placeCount ? candidate : current),
		{ placeCount: 0, tierIndexes: [] as number[] }
	);
	const resolvedTierIndexes = new Set(best.tierIndexes);
	const orderedTiers = revision.orderedTiers
		.filter((_tier, tierIndex) => resolvedTierIndexes.has(tierIndex))
		.map((tier) => ({ placeIds: [...tier.placeIds] }));
	const unresolvedPlaceIds = new Set(
		revision.orderedTiers
			.filter((_tier, tierIndex) => !resolvedTierIndexes.has(tierIndex))
			.flatMap((tier) => tier.placeIds)
	);
	const adjacency = new Map(
		[...unresolvedPlaceIds].map((placeId) => [placeId, new Set<PlaceId>()])
	);
	for (const relation of revision.unresolvedRelations) {
		if (
			!unresolvedPlaceIds.has(relation.firstPlaceId) ||
			!unresolvedPlaceIds.has(relation.secondPlaceId)
		) {
			continue;
		}
		adjacency.get(relation.firstPlaceId)?.add(relation.secondPlaceId);
		adjacency.get(relation.secondPlaceId)?.add(relation.firstPlaceId);
	}
	const visited = new Set<PlaceId>();
	const unresolvedPlaceGroups: PlaceId[][] = [];
	for (const placeId of unresolvedPlaceIds) {
		if (visited.has(placeId)) continue;
		const group: PlaceId[] = [];
		const pending = [placeId];
		visited.add(placeId);
		while (pending.length > 0) {
			const current = pending.shift();
			if (current === undefined) break;
			group.push(current);
			for (const neighbor of adjacency.get(current) ?? []) {
				if (visited.has(neighbor)) continue;
				visited.add(neighbor);
				pending.push(neighbor);
			}
		}
		unresolvedPlaceGroups.push(group.sort());
	}

	return { orderedTiers, unresolvedPlaceGroups };
}

export function deriveRankingProjection(
	revision: RankingRevision,
	openSession?: RankingSessionSummary
): RankingProjection {
	const hasResolvedRelation =
		revision.activeEvidence.some((item) => item.outcome !== 'skip') ||
		Boolean(revision.manualPlacement);
	const orderCoverage =
		revision.activePlaceIds.length >= 2 && revision.unresolvedRelations.length === 0
			? 'total'
			: hasResolvedRelation
				? 'partial'
				: 'none';
	const repairRequirement = deriveRepairRequirement(revision);
	const nextAction =
		revision.activePlaceIds.length < 2
			? ({
					type: 'select-places',
					minimumAdditionalPlaces: 2 - revision.activePlaceIds.length
				} as const)
			: openSession?.lifecycle === 'open'
				? ({
						type: 'resume-session',
						sessionId: openSession.id,
						purpose: openSession.purpose
					} as const)
				: repairRequirement
					? ({ type: 'repair', requirement: repairRequirement } as const)
					: orderCoverage !== 'total'
						? ({ type: 'continue-ranking' } as const)
						: ({ type: 'view-ranking' } as const);
	return { orderCoverage, repairRequirement, nextAction };
}
