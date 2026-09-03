export type PlacementTarget = { type: 'boundary' | 'tie'; index: number };

export interface PlacementSource {
	readonly sourceTierIndex: number;
	readonly sourceTierSize: number;
}

export interface TierGeometry {
	readonly index: number;
	readonly top: number;
	readonly bottom: number;
}

export function isPlacementTargetAllowed(target: PlacementTarget, source: PlacementSource) {
	return target.type === 'tie'
		? target.index !== source.sourceTierIndex
		: !(
				source.sourceTierSize === 1 &&
				(target.index === source.sourceTierIndex || target.index === source.sourceTierIndex + 1)
			);
}

/**
 * Finds the strict-boundary or equality target nearest to a fixed viewport Y coordinate. Boundary
 * positions use the visible gaps between tier cards, while equality positions use tier centers.
 */
export function nearestPlacementTarget(
	tiers: readonly TierGeometry[],
	anchorY: number,
	source: PlacementSource
): PlacementTarget | undefined {
	if (tiers.length === 0 || !Number.isFinite(anchorY)) return undefined;
	const ordered = [...tiers].sort((first, second) => first.index - second.index);
	const candidates: { target: PlacementTarget; y: number }[] = [];

	for (const [position, tier] of ordered.entries()) {
		const boundaryY = position === 0 ? tier.top : (ordered[position - 1].bottom + tier.top) / 2;
		candidates.push({ target: { type: 'boundary', index: tier.index }, y: boundaryY });
		candidates.push({
			target: { type: 'tie', index: tier.index },
			y: (tier.top + tier.bottom) / 2
		});
	}
	const last = ordered.at(-1)!;
	candidates.push({
		target: { type: 'boundary', index: last.index + 1 },
		y: last.bottom
	});

	return candidates
		.filter((candidate) => isPlacementTargetAllowed(candidate.target, source))
		.sort(
			(first, second) =>
				Math.abs(first.y - anchorY) - Math.abs(second.y - anchorY) ||
				(first.target.type === 'tie' ? 0 : 1) - (second.target.type === 'tie' ? 0 : 1) ||
				first.target.index - second.target.index
		)[0]?.target;
}
