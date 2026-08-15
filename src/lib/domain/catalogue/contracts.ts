import type { RankingCategory } from '../ranking/contracts';

export type OsmElementType = 'node' | 'way' | 'relation';
export type DataClass = 'real' | 'synthetic';
export type CatalogueRecordStatus = 'active' | 'quarantined' | 'hidden';

export interface OsmIdentity {
	provider: 'openstreetmap';
	elementType: OsmElementType;
	elementId: number;
}

export interface SourceSnapshotInput extends OsmIdentity {
	category: RankingCategory;
	dataClass: DataClass;
	sourceVersion: number;
	sourceTimestamp?: Date;
	tags: Readonly<Record<string, string>>;
	latitude: number;
	longitude: number;
}

export interface LocalityBoundaryIdentity extends OsmIdentity {
	adminLevel: 4 | 6 | 8;
	name: string;
	countryCode: string;
}

export interface NormalizedLocalityBoundary extends LocalityBoundaryIdentity {
	sourceVersion: number;
	sourceTimestamp?: Date;
	tags: Readonly<Record<string, string>>;
	latitude: number;
	longitude: number;
	contentHash: string;
}

export interface CanonicalLocality {
	countryCode: string;
	region?: LocalityBoundaryIdentity;
	province?: LocalityBoundaryIdentity;
	municipality?: LocalityBoundaryIdentity;
	settlementName?: string;
	postalCode?: string;
	displayLabel: string;
	searchText: string;
	indexVersion: string;
}

export interface NormalizedPlaceInput extends SourceSnapshotInput {
	name: string;
	normalizedName: string;
	addressLabel?: string;
	locality: CanonicalLocality;
	contentHash: string;
	quarantineReason?: string;
}

export interface CatalogueSearchQuery {
	category: RankingCategory;
	/** Product search defaults to real data. Synthetic fixtures require an explicit test-only query. */
	dataClass?: DataClass;
	text: string;
	municipalityBoundaryKey?: string;
	bounds?: { south: number; west: number; north: number; east: number };
	limit?: number;
	offset?: number;
}

export interface CatalogueSearchResult {
	placeId: string;
	name: string;
	category: RankingCategory;
	latitude: number;
	longitude: number;
	displayLocality: string;
	municipalityBoundaryKey?: string;
	addressLabel?: string;
	source: OsmIdentity;
}

export function osmIdentityKey(identity: OsmIdentity) {
	return `${identity.provider}:${identity.elementType}:${identity.elementId}`;
}

export function boundaryKey(identity: LocalityBoundaryIdentity | undefined) {
	return identity ? osmIdentityKey(identity) : undefined;
}
