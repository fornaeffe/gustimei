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
		supersedesEvidenceId: string;
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
	return {
		id: `${sessionId}:comparison:${sequence}`,
		logicalPair,
		leftPlaceId,
		rightPlaceId,
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
		this.#algorithm = clone(state.algorithm);
		this.#pendingRequest = clone(state.pendingRequest);
		this.#evidence = clone(state.evidence);
		this.#nextSequence = state.nextSequence;
		this.#history = clone(state.history);
		this.#estimatedTotal = state.estimatedTotal;
		this.#advance();
	}

	static initial(input: { id: string; listId: string; placeIds: readonly PlaceId[] }) {
		const placeIds = [...new Set(input.placeIds)];
		if (placeIds.length !== input.placeIds.length) throw new Error('Ranking items must be unique');
		return new RankingSession({
			version: 1,
			id: input.id,
			listId: input.listId,
			purpose: 'initial-order',
			lifecycle: 'open',
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
			algorithm: { kind: 'repair', requests: conflicts, requestIndex: 0 },
			evidence: [],
			nextSequence: 1,
			history: [],
			estimatedTotal: conflicts.length
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

	evidenceForNextRevision(baseRevision?: RankingRevision): readonly ComparisonEvidence[] {
		const baseEvidence = baseRevision
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
		this.#consumeOutcome(outcome);
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

	#serializedState(): SerializedRankingSession {
		return {
			version: 1,
			id: this.id,
			listId: this.listId,
			baseRevisionId: this.baseRevisionId,
			purpose: this.purpose,
			lifecycle: this.#lifecycle,
			algorithm: clone(this.#algorithm),
			pendingRequest: clone(this.#pendingRequest),
			evidence: clone(this.#evidence),
			nextSequence: this.#nextSequence,
			history: clone(this.#history),
			estimatedTotal: this.#estimatedTotal
		};
	}

	#consumeOutcome(outcome: ComparisonOutcome) {
		if (this.#algorithm.kind === 'initial') this.#consumeInitial(outcome);
		else if (this.#algorithm.kind === 'insertion') this.#consumeInsertion(outcome);
		else this.#algorithm.requestIndex += 1;
	}

	#consumeInitial(outcome: ComparisonOutcome) {
		const current = this.#algorithm.kind === 'initial' ? this.#algorithm.current : undefined;
		if (!current) throw new Error('Missing merge state');
		const left = current.left[current.leftIndex];
		const right = current.right[current.rightIndex];
		if (outcome === 'tie') {
			current.merged.push([...left, ...right].sort());
			current.leftIndex += 1;
			current.rightIndex += 1;
		} else if (outcome === 'left' || (outcome === 'skip' && left[0].localeCompare(right[0]) <= 0)) {
			current.merged.push(left);
			current.leftIndex += 1;
		} else {
			current.merged.push(right);
			current.rightIndex += 1;
		}
	}

	#consumeInsertion(outcome: ComparisonOutcome) {
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
		if (outcome === 'left') state.high = middle;
		else if (outcome === 'right') state.low = middle + 1;
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
		else this.#advanceRepair();
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
