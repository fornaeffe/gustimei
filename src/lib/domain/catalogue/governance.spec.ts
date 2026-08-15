import { describe, expect, it } from 'vitest';
import {
	applyCatalogueOverride,
	classifyOverrideReconciliation,
	selectOverriddenBaseValues,
	validateCatalogueOverridePatch,
	type EffectivePlaceValues
} from './governance';

const base: EffectivePlaceValues = {
	name: 'Source name',
	addressLabel: 'Via Uno 1',
	latitude: 45,
	longitude: 9,
	locality: {
		countryCode: 'IT',
		postalCode: '20100',
		settlementName: 'Milano',
		regionBoundaryKey: 'openstreetmap:relation:1',
		regionName: 'Lombardia',
		provinceBoundaryKey: 'openstreetmap:relation:2',
		provinceName: 'Milano',
		municipalityBoundaryKey: 'openstreetmap:relation:3',
		municipalityName: 'Milano',
		displayLocality: 'Milano, Lombardia'
	},
	visibility: { status: 'active', reason: null }
};

describe('catalogue governance overrides', () => {
	it('accepts only allowlisted, shaped effective fields', () => {
		expect(
			validateCatalogueOverridePatch({
				name: 'Correct name',
				coordinates: { latitude: 45.1, longitude: 9.1 },
				locality: { displayLocality: 'Milano' },
				visibility: { status: 'quarantined', reason: 'temporary-closure' }
			})
		).toEqual({
			name: 'Correct name',
			coordinates: { latitude: 45.1, longitude: 9.1 },
			locality: { displayLocality: 'Milano' },
			visibility: { status: 'quarantined', reason: 'temporary-closure' }
		});
		expect(() =>
			validateCatalogueOverridePatch({ category: 'hotel', name: 'Not allowed' })
		).toThrow('unsupported fields');
		expect(() => validateCatalogueOverridePatch({ coordinates: { latitude: 45 } })).toThrow(
			'must be overridden together'
		);
		expect(() => validateCatalogueOverridePatch({ visibility: { status: 'hidden' } })).toThrow(
			'require a reason'
		);
	});

	it('applies patches without mutating the provider-derived values', () => {
		const patch = validateCatalogueOverridePatch({
			name: ' Correct name ',
			addressLabel: null,
			locality: { displayLocality: 'Milano centro', postalCode: null }
		});
		const resolved = applyCatalogueOverride(base, patch);
		expect(resolved).toMatchObject({
			name: 'Correct name',
			addressLabel: null,
			locality: { displayLocality: 'Milano centro', postalCode: null }
		});
		expect(base).toMatchObject({
			name: 'Source name',
			addressLabel: 'Via Uno 1',
			locality: { displayLocality: 'Milano, Lombardia', postalCode: '20100' }
		});
		expect(selectOverriddenBaseValues(base, patch)).toEqual({
			name: 'Source name',
			addressLabel: 'Via Uno 1',
			locality: base.locality
		});
	});

	it('surfaces upstream matches, conflicts, and expiries without retiring an override', () => {
		const patch = validateCatalogueOverridePatch({ name: 'Correct name' });
		const previousBase = selectOverriddenBaseValues(base, patch);
		const now = new Date('2026-08-15T10:00:00Z');
		expect(classifyOverrideReconciliation(base, patch, previousBase, now)).toBe('approved');
		expect(
			classifyOverrideReconciliation({ ...base, name: 'Correct name' }, patch, previousBase, now)
		).toBe('upstream-match');
		expect(
			classifyOverrideReconciliation(
				{ ...base, name: 'Another source name' },
				patch,
				previousBase,
				now
			)
		).toBe('conflict');
		expect(
			classifyOverrideReconciliation(
				base,
				patch,
				previousBase,
				now,
				new Date('2026-08-15T09:59:59Z')
			)
		).toBe('review-required');
	});
});
