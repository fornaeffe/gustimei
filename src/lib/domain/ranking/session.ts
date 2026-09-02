import type {
	ComparisonEvidence,
	ComparisonOutcome,
	ComparisonReason,
	ComparisonRequest,
	EquivalenceTier,
	PlaceId,
	RankingProgress,
	RankingRevision,
	RankingSessionLifecycle,
	RankingSessionPurpose,
	RankingSessionSummary
} from './contracts';
import { deriveRepairRequirement } from './revision';

interface MergeState {
	left: PlaceId[][];
	right: PlaceId[][];
	leftIndex: number;
	rightIndex: number;
	merged: PlaceId[][];
}

interface InitialAlgorithmState {
	kind: 'initial';
	runs: PlaceId[][][];
	pairIndex: number;
	nextRuns: PlaceId[][][];
	current?: MergeState;
	result?: PlaceId[][];
}

interface InsertionAlgorithmState {
	kind: 'insertion';
	newPlaceId: PlaceId;
	tiers: PlaceId[][];
	low: number;
	high: number;
	pendingTie?: { tierIndex: number; confirmationPlaceId: PlaceId };
	result?:
		| { type: 'inserted'; tierIndex: number }
		| { type: 'tied'; tierIndex: number }
		| { type: 'repair'; tierIndex: number };
}

interface RepairAlgorithmState {
	kind: 'repair';
	requests: Array<{
		leftPlaceId: PlaceId;
		rightPlaceId: PlaceId;
		supersedesEvidenceId?: string;
	}>;
	requestIndex: number;
}

type AlgorithmState = InitialAlgorithmState | InsertionAlgorithmState | RepairAlgorithmState;

interface AlgorithmSnapshot {
	algorithm: AlgorithmState;
	pendingRequest?: ComparisonRequest;
}

interface SerializedRankingSession {
	version: 1;
	id: string;
	listId: string;
	baseRevisionId?: string;
	purpose: RankingSessionPurpose;
	lifecycle: RankingSessionLifecycle;
	placeIdsSnapshot?: PlaceId[];
	algorithm: AlgorithmState;
	pendingRequest?: ComparisonRequest;
	evidence: ComparisonEvidence[];
	nextSequence: number;
	history: AlgorithmSnapshot[];
	estimatedTotal: number;
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

function mergeSortWorstCase(itemCount: number) {
	if (itemCount < 2) return 0;
	const power = Math.ceil(Math.log2(itemCount));
	return itemCount * power - 2 ** power + 1;
}

function compareRequest(
	sessionId: string,
	sequence: number,
	leftPlaceId: PlaceId,
	rightPlaceId: PlaceId,
	reason: ComparisonReason
): ComparisonRequest {
	const logicalPair = [leftPlaceId, rightPlaceId].sort() as [PlaceId, PlaceId];
	// Presentation is deterministic for a persisted request, but independent from the
	// algorithm's preferred/other operand ordering. This avoids leaking a stable
	// "better place is usually on the left" pattern into the UI or evidence.
	const presentationSeed = `${sessionId}:${sequence}`;
	let hash = 0;
	for (const character of presentationSeed) hash = (hash * 31 + character.charCodeAt(0)) | 0;
	const swapPresentation = Math.abs(hash) % 2 === 1;
	return {
		id: `${sessionId}:comparison:${sequence}`,
		logicalPair,
		leftPlaceId: swapPresentation ? rightPlaceId : leftPlaceId,
		rightPlaceId: swapPresentation ? leftPlaceId : rightPlaceId,
		reason
	};
}

function normalizedTiers(tiers: readonly EquivalenceTier[]) {
	return tiers.map((tier) => [...tier.placeIds].sort());
}

export class RankingSession {
	readonly id: string;
	readonly listId: string;
	readonly baseRevisionId?: string;
	readonly purpose: RankingSessionPurpose;
	#lifecycle: RankingSessionLifecycle;
	#placeIdsSnapshot: PlaceId[];
	#algorithm: AlgorithmState;
	#pendingRequest?: ComparisonRequest;
	#evidence: ComparisonEvidence[];
	#nextSequence: number;
	#history: AlgorithmSnapshot[];
	#estimatedTotal: number;

	private constructor(state: SerializedRankingSession) {
		this.id = state.id;
		this.listId = state.listId;
		this.baseRevisionId = state.baseRevisionId;
		this.purpose = state.purpose;
		this.#lifecycle = state.lifecycle;
		this.#placeIdsSnapshot = clone(
			state.placeIdsSnapshot ?? RankingSession.#recoverPlaceIdsSnapshot(state)
		);
		this.#algorithm = clone(state.algorithm);
		this.#pendingRequest = clone(state.pendingRequest);
		this.#evidence = clone(state.evidence);
		this.#nextSequence = state.nextSequence;
		this.#history = clone(state.history);
		this.#estimatedTotal = state.estimatedTotal;
		this.#advance();
	}

	static initial(input: { id: string; listId: string; placeIds: readonly PlaceId[] }) {
		return RankingSession.#fullOrdering({ ...input, purpose: 'initial-order' });
	}

	static rebuild(input: {
		id: string;
		listId: string;
		baseRevision: RankingRevision;
		placeIds: readonly PlaceId[];
	}) {
		if (input.baseRevision.listId !== input.listId) {
			throw new Error('The rebuilt revision must belong to the ranking list');
		}
		return RankingSession.#fullOrdering({
			...input,
			baseRevisionId: input.baseRevision.id,
			purpose: 'rebuild'
		});
	}

	static #fullOrdering(input: {
		id: string;
		listId: string;
		baseRevisionId?: string;
		purpose: Extract<RankingSessionPurpose, 'initial-order' | 'rebuild'>;
		placeIds: readonly PlaceId[];
	}) {
		const placeIds = [...new Set(input.placeIds)];
		if (placeIds.length !== input.placeIds.length) throw new Error('Ranking items must be unique');
		return new RankingSession({
			version: 1,
			id: input.id,
			listId: input.listId,
			baseRevisionId: input.baseRevisionId,
			purpose: input.purpose,
			lifecycle: 'open',
			placeIdsSnapshot: [...placeIds],
			algorithm: {
				kind: 'initial',
				runs: placeIds.map((placeId) => [[placeId]]),
				pairIndex: 0,
				nextRuns: []
			},
			evidence: [],
			nextSequence: 1,
			history: [],
			estimatedTotal: mergeSortWorstCase(placeIds.length)
		});
	}

	static insertion(input: {
		id: string;
		listId: string;
		baseRevision: RankingRevision;
		newPlaceId: PlaceId;
	}) {
		if (input.baseRevision.unresolvedRelations.length > 0) {
			throw new Error('Binary insertion requires a total base revision');
		}
		if (input.baseRevision.activePlaceIds.includes(input.newPlaceId)) {
			throw new Error('The inserted place must be new to the ranking');
		}
		const tiers = normalizedTiers(input.baseRevision.orderedTiers);
		return new RankingSession({
			version: 1,
			id: input.id,
			listId: input.listId,
			baseRevisionId: input.baseRevision.id,
			purpose: 'insertion',
			lifecycle: 'open',
			placeIdsSnapshot: [...input.baseRevision.activePlaceIds, input.newPlaceId],
			algorithm: {
				kind: 'insertion',
				newPlaceId: input.newPlaceId,
				tiers,
				low: 0,
				high: tiers.length
			},
			evidence: [],
			nextSequence: 1,
			history: [],
			estimatedTotal: Math.ceil(Math.log2(tiers.length + 1)) + 1
		});
	}

	static reposition(input: {
		id: string;
		listId: string;
		baseRevision: RankingRevision;
		placeId: PlaceId;
	}) {
		if (input.baseRevision.unresolvedRelations.length > 0) {
			throw new Error('Repositioning requires a total base revision');
		}
		if (!input.baseRevision.activePlaceIds.includes(input.placeId)) {
			throw new Error('The repositioned place must belong to the ranking');
		}
		const tiers = normalizedTiers(input.baseRevision.orderedTiers)
			.map((tier) => tier.filter((placeId) => placeId !== input.placeId))
			.filter((tier) => tier.length > 0);
		return new RankingSession({
			version: 1,
			id: input.id,
			listId: input.listId,
			baseRevisionId: input.baseRevision.id,
			purpose: 'reposition',
			lifecycle: 'open',
			placeIdsSnapshot: [...input.baseRevision.activePlaceIds],
			algorithm: {
				kind: 'insertion',
				newPlaceId: input.placeId,
				tiers,
				low: 0,
				high: tiers.length
			},
			evidence: [],
			nextSequence: 1,
			history: [],
			estimatedTotal: Math.ceil(Math.log2(tiers.length + 1)) + 1
		});
	}

	static repair(input: { id: string; listId: string; baseRevision: RankingRevision }) {
		const repair = deriveRepairRequirement(input.baseRevision);
		if (!repair) throw new Error('The revision has no contradiction to repair');
		const conflicts = input.baseRevision.excludedEvidence
			.filter((item) => repair.evidenceIds.includes(item.evidence.id))
			.map((item) => ({
				leftPlaceId: item.evidence.leftPlaceId,
				rightPlaceId: item.evidence.rightPlaceId,
				supersedesEvidenceId: item.evidence.id
			}));
		return new RankingSession({
			version: 1,
			id: input.id,
			listId: input.listId,
			baseRevisionId: input.baseRevision.id,
			purpose: 'repair',
			lifecycle: 'open',
			placeIdsSnapshot: [...input.baseRevision.activePlaceIds],
			algorithm: { kind: 'repair', requests: conflicts, requestIndex: 0 },
			evidence: [],
			nextSequence: 1,
			history: [],
			estimatedTotal: conflicts.length
		});
	}

	static completion(input: { id: string; listId: string; baseRevision: RankingRevision }) {
		const relation = [...input.baseRevision.unresolvedRelations].sort(
			(first, second) =>
				(first.reason === 'missing-evidence' ? 0 : 1) -
					(second.reason === 'missing-evidence' ? 0 : 1) ||
				first.firstPlaceId.localeCompare(second.firstPlaceId) ||
				first.secondPlaceId.localeCompare(second.secondPlaceId)
		)[0];
		if (!relation) throw new Error('The revision has no unresolved relation to complete');
		return new RankingSession({
			version: 1,
			id: input.id,
			listId: input.listId,
			baseRevisionId: input.baseRevision.id,
			purpose: 'completion',
			lifecycle: 'open',
			placeIdsSnapshot: [...input.baseRevision.activePlaceIds],
			algorithm: {
				kind: 'repair',
				requests: [
					{
						leftPlaceId: relation.firstPlaceId,
						rightPlaceId: relation.secondPlaceId
					}
				],
				requestIndex: 0
			},
			pendingRequest: compareRequest(
				input.id,
				1,
				relation.firstPlaceId,
				relation.secondPlaceId,
				'order-completion'
			),
			evidence: [],
			nextSequence: 1,
			history: [],
			estimatedTotal: 1
		});
	}

	static reconsider(input: {
		id: string;
		listId: string;
		baseRevision: RankingRevision;
		evidenceId: string;
	}) {
		const evidence = input.baseRevision.activeEvidence.find(
			(item) => item.id === input.evidenceId && item.outcome !== 'skip'
		);
		if (!evidence) throw new Error('The selected ranking answer cannot be reconsidered');
		return new RankingSession({
			version: 1,
			id: input.id,
			listId: input.listId,
			baseRevisionId: input.baseRevision.id,
			purpose: 'repair',
			lifecycle: 'open',
			placeIdsSnapshot: [...input.baseRevision.activePlaceIds],
			algorithm: {
				kind: 'repair',
				requests: [
					{
						leftPlaceId: evidence.leftPlaceId,
						rightPlaceId: evidence.rightPlaceId,
						supersedesEvidenceId: evidence.id
					}
				],
				requestIndex: 0
			},
			evidence: [],
			nextSequence: 1,
			history: [],
			estimatedTotal: 1
		});
	}

	static resume(serialized: string) {
		const state = JSON.parse(serialized) as SerializedRankingSession;
		if (state.version !== 1) throw new Error('Unsupported ranking session version');
		return new RankingSession(state);
	}

	get lifecycle() {
		return this.#lifecycle;
	}

	get evidence(): readonly ComparisonEvidence[] {
		return clone(this.#evidence);
	}

	get placeIdsSnapshot(): readonly PlaceId[] {
		return clone(this.#placeIdsSnapshot);
	}

	latestActiveEvidence(): ComparisonEvidence | undefined {
		return clone([...this.#evidence].reverse().find((item) => item.active));
	}

	evidenceForNextRevision(baseRevision?: RankingRevision): readonly ComparisonEvidence[] {
		const baseEvidence =
			baseRevision && this.purpose !== 'rebuild'
				? [
						...baseRevision.activeEvidence,
						...baseRevision.excludedEvidence.map((item) => item.evidence)
					]
				: [];
		const uniqueBaseEvidence = [...new Map(baseEvidence.map((item) => [item.id, item])).values()];
		const maximumSequence = uniqueBaseEvidence.reduce(
			(maximum, item) => Math.max(maximum, item.sequence),
			0
		);
		return [
			...clone(uniqueBaseEvidence),
			...this.#evidence.map((item) => ({
				...clone(item),
				sequence: maximumSequence + item.sequence
			}))
		];
	}

	nextComparison(): ComparisonRequest | undefined {
		return clone(this.#pendingRequest);
	}

	submit(outcome: ComparisonOutcome) {
		if (this.#lifecycle !== 'open' || !this.#pendingRequest) {
			throw new Error('The session has no comparison awaiting an outcome');
		}
		this.#history.push({
			algorithm: clone(this.#algorithm),
			pendingRequest: clone(this.#pendingRequest)
		});
		const request = this.#pendingRequest;
		const supersedesEvidenceId =
			this.#algorithm.kind === 'repair'
				? this.#algorithm.requests[this.#algorithm.requestIndex]?.supersedesEvidenceId
				: undefined;
		this.#evidence.push({
			...request,
			sequence: this.#nextSequence,
			outcome,
			active: true,
			...(supersedesEvidenceId ? { supersedesEvidenceId } : {})
		});
		this.#nextSequence += 1;
		this.#pendingRequest = undefined;
		this.#consumeOutcome(outcome, request);
		this.#advance();
	}

	undo() {
		const snapshot = this.#history.pop();
		if (!snapshot) return false;
		const lastActive = [...this.#evidence].reverse().find((item) => item.active);
		if (lastActive) lastActive.active = false;
		this.#algorithm = clone(snapshot.algorithm);
		this.#pendingRequest = snapshot.pendingRequest
			? { ...clone(snapshot.pendingRequest), id: `${this.id}:comparison:${this.#nextSequence}` }
			: undefined;
		this.#lifecycle = 'open';
		return true;
	}

	supersede() {
		if (this.#lifecycle === 'open') this.#lifecycle = 'superseded';
		this.#pendingRequest = undefined;
	}

	progress(): RankingProgress {
		const answered = this.#evidence.filter((item) => item.active).length;
		const estimatedTotal = Math.max(answered, this.#estimatedTotal);
		const estimatedRemaining =
			this.#lifecycle === 'completed' ? 0 : Math.max(0, estimatedTotal - answered);
		return {
			answered,
			estimatedTotal,
			estimatedRemaining,
			fraction:
				this.#lifecycle === 'completed'
					? 1
					: estimatedTotal === 0
						? 0
						: Math.min(0.99, answered / estimatedTotal),
			isEstimate: true
		};
	}

	summary(): RankingSessionSummary {
		return {
			id: this.id,
			listId: this.listId,
			baseRevisionId: this.baseRevisionId,
			purpose: this.purpose,
			lifecycle: this.#lifecycle,
			progress: this.progress()
		};
	}

	serialize() {
		return JSON.stringify(this.#serializedState());
	}

	initialTierResult(): readonly EquivalenceTier[] | undefined {
		if (this.#algorithm.kind !== 'initial' || !this.#algorithm.result) return undefined;
		return this.#algorithm.result.map((placeIds) => ({ placeIds: [...placeIds] }));
	}

	insertionResult() {
		if (this.#algorithm.kind !== 'insertion') return undefined;
		return clone(this.#algorithm.result);
	}

	placedTierResult(): readonly EquivalenceTier[] | undefined {
		if (this.#algorithm.kind !== 'insertion') return undefined;
		const result = this.#algorithm.result;
		if (!result || result.type === 'repair') return undefined;
		const tiers = this.#algorithm.tiers.map((placeIds) => [...placeIds]);
		if (result.type === 'tied') tiers[result.tierIndex].push(this.#algorithm.newPlaceId);
		else tiers.splice(result.tierIndex, 0, [this.#algorithm.newPlaceId]);
		return tiers.map((placeIds) => ({ placeIds: placeIds.sort() }));
	}

	invalidatedEvidenceIdsForNextRevision(baseRevision: RankingRevision): readonly string[] {
		const previouslyInvalidated = baseRevision.excludedEvidence
			.filter((item) => item.reason === 'invalidated')
			.map((item) => item.evidence.id);
		if (this.purpose !== 'reposition' || this.#algorithm.kind !== 'insertion') {
			return previouslyInvalidated;
		}
		const repositionedPlaceId = this.#algorithm.newPlaceId;
		const repositionedEvidence = [
			...baseRevision.activeEvidence,
			...baseRevision.excludedEvidence.map((item) => item.evidence)
		]
			.filter(
				(item) =>
					item.leftPlaceId === repositionedPlaceId || item.rightPlaceId === repositionedPlaceId
			)
			.map((item) => item.id);
		return [...new Set([...previouslyInvalidated, ...repositionedEvidence])];
	}

	#serializedState(): SerializedRankingSession {
		return {
			version: 1,
			id: this.id,
			listId: this.listId,
			baseRevisionId: this.baseRevisionId,
			purpose: this.purpose,
			lifecycle: this.#lifecycle,
			placeIdsSnapshot: clone(this.#placeIdsSnapshot),
			algorithm: clone(this.#algorithm),
			pendingRequest: clone(this.#pendingRequest),
			evidence: clone(this.#evidence),
			nextSequence: this.#nextSequence,
			history: clone(this.#history),
			estimatedTotal: this.#estimatedTotal
		};
	}

	static #recoverPlaceIdsSnapshot(state: SerializedRankingSession) {
		const placeIds = new Set<PlaceId>();
		const addTiers = (tiers: PlaceId[][] | undefined) => {
			for (const tier of tiers ?? []) for (const placeId of tier) placeIds.add(placeId);
		};
		if (state.algorithm.kind === 'initial') {
			for (const run of state.algorithm.runs) addTiers(run);
			for (const run of state.algorithm.nextRuns) addTiers(run);
			addTiers(state.algorithm.current?.left);
			addTiers(state.algorithm.current?.right);
			addTiers(state.algorithm.current?.merged);
			addTiers(state.algorithm.result);
		} else if (state.algorithm.kind === 'insertion') {
			addTiers(state.algorithm.tiers);
			placeIds.add(state.algorithm.newPlaceId);
		} else if (state.algorithm.kind === 'repair') {
			for (const request of state.algorithm.requests) {
				placeIds.add(request.leftPlaceId);
				placeIds.add(request.rightPlaceId);
			}
		}
		for (const evidence of state.evidence) {
			placeIds.add(evidence.leftPlaceId);
			placeIds.add(evidence.rightPlaceId);
		}
		return [...placeIds];
	}

	#consumeOutcome(outcome: ComparisonOutcome, request: ComparisonRequest) {
		if (this.#algorithm.kind === 'initial') this.#consumeInitial(outcome, request);
		else if (this.#algorithm.kind === 'insertion') this.#consumeInsertion(outcome, request);
		else if (this.#algorithm.kind === 'repair') this.#algorithm.requestIndex += 1;
		else this.#lifecycle = 'completed';
	}

	#consumeInitial(outcome: ComparisonOutcome, request: ComparisonRequest) {
		const current = this.#algorithm.kind === 'initial' ? this.#algorithm.current : undefined;
		if (!current) throw new Error('Missing merge state');
		const left = current.left[current.leftIndex];
		const right = current.right[current.rightIndex];
		const preferredPlaceId =
			outcome === 'left'
				? request.leftPlaceId
				: outcome === 'right'
					? request.rightPlaceId
					: undefined;
		if (outcome === 'tie') {
			current.merged.push([...left, ...right].sort());
			current.leftIndex += 1;
			current.rightIndex += 1;
		} else if (
			preferredPlaceId === left[0] ||
			(outcome === 'skip' && left[0].localeCompare(right[0]) <= 0)
		) {
			current.merged.push(left);
			current.leftIndex += 1;
		} else {
			current.merged.push(right);
			current.rightIndex += 1;
		}
	}

	#consumeInsertion(outcome: ComparisonOutcome, request: ComparisonRequest) {
		if (this.#algorithm.kind !== 'insertion') return;
		const state = this.#algorithm;
		if (state.pendingTie) {
			state.result =
				outcome === 'tie'
					? { type: 'tied', tierIndex: state.pendingTie.tierIndex }
					: { type: 'repair', tierIndex: state.pendingTie.tierIndex };
			state.pendingTie = undefined;
			return;
		}
		const middle = Math.floor((state.low + state.high) / 2);
		const tier = state.tiers[middle];
		const preferredPlaceId =
			outcome === 'left'
				? request.leftPlaceId
				: outcome === 'right'
					? request.rightPlaceId
					: undefined;
		if (preferredPlaceId === state.newPlaceId) state.high = middle;
		else if (preferredPlaceId) state.low = middle + 1;
		else if (outcome === 'tie' && tier.length === 1)
			state.result = { type: 'tied', tierIndex: middle };
		else if (outcome === 'tie') {
			state.pendingTie = { tierIndex: middle, confirmationPlaceId: tier[1] };
		} else state.result = { type: 'repair', tierIndex: middle };
	}

	#advance() {
		if (this.#lifecycle !== 'open' || this.#pendingRequest) return;
		if (this.#algorithm.kind === 'initial') this.#advanceInitial();
		else if (this.#algorithm.kind === 'insertion') this.#advanceInsertion();
		else if (this.#algorithm.kind === 'repair') this.#advanceRepair();
	}

	#advanceInitial() {
		if (this.#algorithm.kind !== 'initial') return;
		const state = this.#algorithm;
		while (!this.#pendingRequest && !state.result) {
			if (state.current) {
				if (
					state.current.leftIndex < state.current.left.length &&
					state.current.rightIndex < state.current.right.length
				) {
					const left = state.current.left[state.current.leftIndex][0];
					const right = state.current.right[state.current.rightIndex][0];
					this.#pendingRequest = compareRequest(
						this.id,
						this.#nextSequence,
						left,
						right,
						'initial-order'
					);
					return;
				}
				state.current.merged.push(...state.current.left.slice(state.current.leftIndex));
				state.current.merged.push(...state.current.right.slice(state.current.rightIndex));
				state.nextRuns.push(state.current.merged);
				state.current = undefined;
			}
			if (state.pairIndex < state.runs.length) {
				const left = state.runs[state.pairIndex];
				const right = state.runs[state.pairIndex + 1];
				state.pairIndex += 2;
				if (!right) state.nextRuns.push(left);
				else state.current = { left, right, leftIndex: 0, rightIndex: 0, merged: [] };
				continue;
			}
			if (state.nextRuns.length <= 1) {
				state.result = state.nextRuns[0] ?? [];
				this.#lifecycle = 'completed';
				return;
			}
			state.runs = state.nextRuns;
			state.nextRuns = [];
			state.pairIndex = 0;
		}
	}

	#advanceInsertion() {
		if (this.#algorithm.kind !== 'insertion') return;
		const state = this.#algorithm;
		if (state.result) {
			this.#lifecycle = 'completed';
			return;
		}
		if (state.pendingTie) {
			this.#pendingRequest = compareRequest(
				this.id,
				this.#nextSequence,
				state.newPlaceId,
				state.pendingTie.confirmationPlaceId,
				'tie-confirmation'
			);
			return;
		}
		if (state.low >= state.high) {
			state.result = { type: 'inserted', tierIndex: state.low };
			this.#lifecycle = 'completed';
			return;
		}
		const middle = Math.floor((state.low + state.high) / 2);
		this.#pendingRequest = compareRequest(
			this.id,
			this.#nextSequence,
			state.newPlaceId,
			state.tiers[middle][0],
			'binary-insertion'
		);
	}

	#advanceRepair() {
		if (this.#algorithm.kind !== 'repair') return;
		const state = this.#algorithm;
		const request = state.requests[state.requestIndex];
		if (!request) {
			this.#lifecycle = 'completed';
			return;
		}
		this.#pendingRequest = compareRequest(
			this.id,
			this.#nextSequence,
			request.leftPlaceId,
			request.rightPlaceId,
			'contradiction-repair'
		);
	}
}
