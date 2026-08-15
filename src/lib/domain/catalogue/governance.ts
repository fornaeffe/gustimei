import type { CatalogueRecordStatus } from './contracts';

export interface EffectiveLocalityValues {
	countryCode: string;
	postalCode: string | null;
	settlementName: string | null;
	regionBoundaryKey: string | null;
	regionName: string | null;
	provinceBoundaryKey: string | null;
	provinceName: string | null;
	municipalityBoundaryKey: string | null;
	municipalityName: string | null;
	displayLocality: string;
}

export interface EffectivePlaceValues {
	name: string;
	addressLabel: string | null;
	latitude: number;
	longitude: number;
	locality: EffectiveLocalityValues;
	visibility: {
		status: CatalogueRecordStatus;
		reason: string | null;
	};
}

export interface CatalogueOverridePatch {
	name?: string;
	addressLabel?: string | null;
	coordinates?: { latitude: number; longitude: number };
	locality?: Partial<EffectiveLocalityValues> & Pick<EffectiveLocalityValues, 'displayLocality'>;
	visibility?: { status: CatalogueRecordStatus; reason?: string | null };
}

const ROOT_KEYS = new Set(['name', 'addressLabel', 'coordinates', 'locality', 'visibility']);
const COORDINATE_KEYS = new Set(['latitude', 'longitude']);
const LOCALITY_KEYS = new Set([
	'countryCode',
	'postalCode',
	'settlementName',
	'regionBoundaryKey',
	'regionName',
	'provinceBoundaryKey',
	'provinceName',
	'municipalityBoundaryKey',
	'municipalityName',
	'displayLocality'
]);
const VISIBILITY_KEYS = new Set(['status', 'reason']);
const RECORD_STATUSES = new Set<CatalogueRecordStatus>(['active', 'quarantined', 'hidden']);

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: Set<string>, label: string) {
	const unknown = Object.keys(value).filter((key) => !allowed.has(key));
	if (unknown.length > 0)
		throw new Error(`${label} contains unsupported fields: ${unknown.join(', ')}`);
}

function assertNullableString(value: unknown, label: string) {
	if (value !== null && typeof value !== 'string')
		throw new Error(`${label} must be a string or null`);
}

function assertCoordinate(value: unknown, minimum: number, maximum: number, label: string) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
		throw new Error(`${label} must be between ${minimum} and ${maximum}`);
	}
}

export function validateCatalogueOverridePatch(value: unknown): CatalogueOverridePatch {
	assertObject(value, 'Catalogue override');
	assertAllowedKeys(value, ROOT_KEYS, 'Catalogue override');
	if (Object.keys(value).length === 0)
		throw new Error('Catalogue override must change at least one field');

	if ('name' in value && (typeof value.name !== 'string' || value.name.trim().length === 0)) {
		throw new Error('Override name must be a non-empty string');
	}
	if ('addressLabel' in value) assertNullableString(value.addressLabel, 'Override address label');

	if ('coordinates' in value) {
		assertObject(value.coordinates, 'Override coordinates');
		assertAllowedKeys(value.coordinates, COORDINATE_KEYS, 'Override coordinates');
		if (!('latitude' in value.coordinates) || !('longitude' in value.coordinates)) {
			throw new Error('Latitude and longitude must be overridden together');
		}
		assertCoordinate(value.coordinates.latitude, -90, 90, 'Override latitude');
		assertCoordinate(value.coordinates.longitude, -180, 180, 'Override longitude');
	}

	if ('locality' in value) {
		assertObject(value.locality, 'Override locality');
		assertAllowedKeys(value.locality, LOCALITY_KEYS, 'Override locality');
		if (
			typeof value.locality.displayLocality !== 'string' ||
			value.locality.displayLocality.trim().length === 0
		) {
			throw new Error('Override locality must include a non-empty display locality');
		}
		for (const [key, item] of Object.entries(value.locality)) {
			if (key !== 'displayLocality') assertNullableString(item, `Override locality ${key}`);
		}
	}

	if ('visibility' in value) {
		assertObject(value.visibility, 'Override visibility');
		assertAllowedKeys(value.visibility, VISIBILITY_KEYS, 'Override visibility');
		if (!RECORD_STATUSES.has(value.visibility.status as CatalogueRecordStatus)) {
			throw new Error('Override visibility status is invalid');
		}
		if ('reason' in value.visibility)
			assertNullableString(value.visibility.reason, 'Visibility reason');
		if (
			value.visibility.status !== 'active' &&
			(typeof value.visibility.reason !== 'string' || value.visibility.reason.trim().length === 0)
		) {
			throw new Error('Quarantined and hidden overrides require a reason');
		}
	}

	return value as CatalogueOverridePatch;
}

export function applyCatalogueOverride(
	base: EffectivePlaceValues,
	patch: CatalogueOverridePatch
): EffectivePlaceValues {
	const locality = patch.locality ? { ...base.locality, ...patch.locality } : base.locality;
	const visibility = patch.visibility
		? { status: patch.visibility.status, reason: patch.visibility.reason?.trim() || null }
		: base.visibility;
	const result: EffectivePlaceValues = {
		...base,
		name: patch.name?.trim() ?? base.name,
		addressLabel:
			patch.addressLabel === undefined ? base.addressLabel : patch.addressLabel?.trim() || null,
		latitude: patch.coordinates?.latitude ?? base.latitude,
		longitude: patch.coordinates?.longitude ?? base.longitude,
		locality: {
			...locality,
			displayLocality: locality.displayLocality.trim()
		},
		visibility
	};
	if (result.visibility.status === 'active' && result.name.trim().length === 0) {
		throw new Error('An active effective place must have a name');
	}
	return result;
}

export function selectOverriddenBaseValues(
	base: EffectivePlaceValues,
	patch: CatalogueOverridePatch
): Partial<EffectivePlaceValues> {
	const selected: Partial<EffectivePlaceValues> = {};
	if (patch.name !== undefined) selected.name = base.name;
	if (patch.addressLabel !== undefined) selected.addressLabel = base.addressLabel;
	if (patch.coordinates) {
		selected.latitude = base.latitude;
		selected.longitude = base.longitude;
	}
	if (patch.locality) selected.locality = { ...base.locality };
	if (patch.visibility) selected.visibility = { ...base.visibility };
	return selected;
}

export function classifyOverrideReconciliation(
	base: EffectivePlaceValues,
	patch: CatalogueOverridePatch,
	previousBase: Partial<EffectivePlaceValues>,
	now: Date,
	expiresAt?: Date | null
): 'approved' | 'review-required' | 'upstream-match' | 'conflict' {
	if (expiresAt && expiresAt <= now) return 'review-required';
	const applied = applyCatalogueOverride(base, patch);
	let matchesOverride = true;
	let changedUpstream = false;
	if (patch.name !== undefined) {
		matchesOverride &&= base.name === applied.name;
		changedUpstream ||= base.name !== previousBase.name;
	}
	if (patch.addressLabel !== undefined) {
		matchesOverride &&= base.addressLabel === applied.addressLabel;
		changedUpstream ||= base.addressLabel !== previousBase.addressLabel;
	}
	if (patch.coordinates) {
		matchesOverride &&= base.latitude === applied.latitude && base.longitude === applied.longitude;
		changedUpstream ||=
			base.latitude !== previousBase.latitude || base.longitude !== previousBase.longitude;
	}
	if (patch.locality) {
		const expected = applied.locality;
		for (const key of Object.keys(patch.locality) as (keyof EffectiveLocalityValues)[]) {
			matchesOverride &&= base.locality[key] === expected[key];
			changedUpstream ||= base.locality[key] !== previousBase.locality?.[key];
		}
	}
	if (patch.visibility) {
		matchesOverride &&=
			base.visibility.status === applied.visibility.status &&
			base.visibility.reason === applied.visibility.reason;
		changedUpstream ||=
			base.visibility.status !== previousBase.visibility?.status ||
			base.visibility.reason !== previousBase.visibility?.reason;
	}
	if (matchesOverride) return 'upstream-match';
	return changedUpstream ? 'conflict' : 'approved';
}
