import { describe, expect, it } from 'vitest';
import { isPlacementTargetAllowed, nearestPlacementTarget } from './manual-placement';

const tiers = [
	{ index: 0, top: 100, bottom: 180 },
	{ index: 1, top: 200, bottom: 280 },
	{ index: 2, top: 300, bottom: 380 }
];

describe('manual placement geometry', () => {
	it('selects equality at a tier center and a strict boundary in the gap', () => {
		const source = { sourceTierIndex: 0, sourceTierSize: 1 };
		expect(nearestPlacementTarget(tiers, 240, source)).toEqual({ type: 'tie', index: 1 });
		expect(nearestPlacementTarget(tiers, 290, source)).toEqual({ type: 'boundary', index: 2 });
	});

	it('excludes both no-op boundaries and the source equality tier for a singleton', () => {
		const source = { sourceTierIndex: 1, sourceTierSize: 1 };
		expect(isPlacementTargetAllowed({ type: 'boundary', index: 1 }, source)).toBe(false);
		expect(isPlacementTargetAllowed({ type: 'boundary', index: 2 }, source)).toBe(false);
		expect(isPlacementTargetAllowed({ type: 'tie', index: 1 }, source)).toBe(false);
	});

	it('allows a member of a tied tier to split immediately above or below its source tier', () => {
		const source = { sourceTierIndex: 1, sourceTierSize: 2 };
		expect(isPlacementTargetAllowed({ type: 'boundary', index: 1 }, source)).toBe(true);
		expect(isPlacementTargetAllowed({ type: 'boundary', index: 2 }, source)).toBe(true);
		expect(nearestPlacementTarget(tiers, 190, source)).toEqual({ type: 'boundary', index: 1 });
	});
});
