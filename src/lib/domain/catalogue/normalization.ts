import { createHash } from 'node:crypto';
import type {
	CanonicalLocality,
	LocalityBoundaryIdentity,
	NormalizedPlaceInput,
	SourceSnapshotInput
} from './contracts';

export const CATALOGUE_NORMALIZER_VERSION = 'osm-restaurant-v2' as const;
export const LOCALITY_INDEX_VERSION = 'osm-admin-4-6-8-text-v2' as const;

export function normalizeSearchText(value: string) {
	return value
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLocaleLowerCase('it-IT')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

function nonEmpty(value: string | undefined) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function addressLabel(tags: Readonly<Record<string, string>>) {
	const street = nonEmpty(tags['addr:street'] ?? tags['addr:place']);
	const houseNumber = nonEmpty(tags['addr:housenumber']);
	return [street, houseNumber].filter(Boolean).join(' ') || undefined;
}

function localityFrom(
	tags: Readonly<Record<string, string>>,
	boundaries: Readonly<Partial<Record<4 | 6 | 8, LocalityBoundaryIdentity>>>
): CanonicalLocality {
	const settlementName = nonEmpty(
		tags['addr:city'] ??
			tags['addr:town'] ??
			tags['addr:village'] ??
			tags['addr:municipality'] ??
			tags['is_in:city']
	);
	const postalCode = nonEmpty(tags['addr:postcode'] ?? tags.postal_code);
	const textRegion = nonEmpty(tags['addr:state']);
	const textProvince = nonEmpty(tags['addr:province']);
	const municipalityName = boundaries[8]?.name ?? settlementName;
	const provinceName = boundaries[6]?.name ?? textProvince;
	const regionName = boundaries[4]?.name ?? textRegion;
	const displayLabel =
		[municipalityName, provinceName, regionName].filter(Boolean).join(', ') || 'Italia';
	const searchText = normalizeSearchText(
		[municipalityName, settlementName, postalCode, provinceName, regionName, 'Italia']
			.filter(Boolean)
			.join(' ')
	);

	return {
		countryCode: nonEmpty(tags['addr:country'])?.toUpperCase() ?? 'IT',
		region: boundaries[4],
		province: boundaries[6],
		municipality: boundaries[8],
		settlementName,
		postalCode,
		displayLabel,
		searchText,
		indexVersion: LOCALITY_INDEX_VERSION
	};
}

export function normalizeOsmPlace(
	source: SourceSnapshotInput,
	boundaries: Readonly<Partial<Record<4 | 6 | 8, LocalityBoundaryIdentity>>> = {}
): NormalizedPlaceInput {
	const name = nonEmpty(source.tags.name) ?? nonEmpty(source.tags['name:it']) ?? '';
	const locality = localityFrom(source.tags, boundaries);
	const normalizedName = normalizeSearchText(name);
	const contentHash = createHash('sha256')
		.update(
			JSON.stringify({
				identity: [source.provider, source.elementType, source.elementId],
				version: source.sourceVersion,
				tags: Object.entries(source.tags).sort(([first], [second]) => first.localeCompare(second)),
				latitude: source.latitude,
				longitude: source.longitude,
				locality
			})
		)
		.digest('hex');
	const countryCode = locality.countryCode;
	const quarantineReason = !name
		? 'missing-name'
		: countryCode !== 'IT'
			? 'outside-italy'
			: undefined;

	return {
		...source,
		name,
		normalizedName,
		addressLabel: addressLabel(source.tags),
		locality,
		contentHash,
		quarantineReason
	};
}
