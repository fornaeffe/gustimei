import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type {
	LocalityBoundaryIdentity,
	NormalizedLocalityBoundary,
	NormalizedPlaceInput,
	OsmElementType,
	SourceSnapshotInput
} from '$lib/domain/catalogue/contracts';
import {
	CATALOGUE_NORMALIZER_VERSION,
	LOCALITY_INDEX_VERSION,
	normalizeOsmPlace
} from '$lib/domain/catalogue/normalization';
import { newApplicationId } from '$lib/domain/ids';
import type { CatalogueRepository } from '$lib/server/repositories/catalogue';
import type { OsmEntity, OsmRelation, OsmSourceReader } from './pbf';
import { PbfSourceReader } from './pbf';

interface Point {
	latitude: number;
	longitude: number;
}

interface PolygonGeometry {
	segments: readonly (readonly [Point, Point])[];
	box: { south: number; west: number; north: number; east: number };
	area: number;
}

interface BoundaryGeometry extends PolygonGeometry {
	identity: LocalityBoundaryIdentity;
	source: CandidateEntity;
}

interface CandidateEntity {
	type: OsmElementType;
	id: number;
	tags: Record<string, string>;
	version: number;
	timestamp?: Date;
	refs?: number[];
	members?: OsmRelation['members'];
}

export interface PreparedOsmImport {
	places: readonly NormalizedPlaceInput[];
	boundaries: readonly NormalizedLocalityBoundary[];
	statistics: Record<string, number>;
}

export interface OsmImportResult {
	importId: string;
	reused: boolean;
	statistics: Record<string, number>;
}

function isRestaurant(entity: OsmEntity) {
	return entity.tags.amenity === 'restaurant';
}

function isAdministrativeBoundary(entity: OsmEntity): entity is OsmRelation {
	return (
		entity.type === 'relation' &&
		entity.tags.boundary === 'administrative' &&
		['4', '6', '8'].includes(entity.tags.admin_level) &&
		Boolean(entity.tags.name)
	);
}

function candidate(entity: OsmEntity): CandidateEntity {
	return {
		type: entity.type,
		id: entity.id,
		tags: { ...entity.tags },
		version: entity.info?.version ?? 1,
		timestamp: entity.info?.timestamp ? new Date(entity.info.timestamp) : undefined,
		...(entity.type === 'way' ? { refs: [...entity.refs] } : {}),
		...(entity.type === 'relation'
			? { members: entity.members.map((member) => ({ ...member })) }
			: {})
	};
}

function representativePoint(points: readonly Point[]) {
	if (points.length === 0) return undefined;
	return {
		latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
		longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length
	};
}

function inside(point: Point, boundary: PolygonGeometry) {
	if (
		point.latitude < boundary.box.south ||
		point.latitude > boundary.box.north ||
		point.longitude < boundary.box.west ||
		point.longitude > boundary.box.east
	) {
		return false;
	}
	let contained = false;
	for (const [first, second] of boundary.segments) {
		const crosses =
			first.latitude > point.latitude !== second.latitude > point.latitude &&
			point.longitude <
				((second.longitude - first.longitude) * (point.latitude - first.latitude)) /
					(second.latitude - first.latitude) +
					first.longitude;
		if (crosses) contained = !contained;
	}
	return contained;
}

const BOUNDARY_GRID_SIZE = 0.25;

class BoundarySpatialIndex {
	readonly #cells = new Map<string, BoundaryGeometry[]>();
	readonly #wide = new Map<4 | 6 | 8, BoundaryGeometry[]>();

	constructor(boundaries: readonly BoundaryGeometry[]) {
		for (const boundary of boundaries) {
			const minX = Math.floor(boundary.box.west / BOUNDARY_GRID_SIZE);
			const maxX = Math.floor(boundary.box.east / BOUNDARY_GRID_SIZE);
			const minY = Math.floor(boundary.box.south / BOUNDARY_GRID_SIZE);
			const maxY = Math.floor(boundary.box.north / BOUNDARY_GRID_SIZE);
			const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
			if (cellCount > 10_000) {
				this.#wide.set(boundary.identity.adminLevel, [
					...(this.#wide.get(boundary.identity.adminLevel) ?? []),
					boundary
				]);
				continue;
			}
			for (let x = minX; x <= maxX; x += 1) {
				for (let y = minY; y <= maxY; y += 1) {
					const key = `${boundary.identity.adminLevel}:${x}:${y}`;
					this.#cells.set(key, [...(this.#cells.get(key) ?? []), boundary]);
				}
			}
		}
	}

	find(point: Point, level: 4 | 6 | 8) {
		const x = Math.floor(point.longitude / BOUNDARY_GRID_SIZE);
		const y = Math.floor(point.latitude / BOUNDARY_GRID_SIZE);
		return [...(this.#cells.get(`${level}:${x}:${y}`) ?? []), ...(this.#wide.get(level) ?? [])]
			.filter((boundary) => inside(point, boundary))
			.sort(
				(first, second) =>
					first.area - second.area || first.identity.elementId - second.identity.elementId
			)[0];
	}
}

function polygonGeometryForRelation(
	relation: CandidateEntity,
	ways: ReadonlyMap<number, readonly number[]>,
	nodes: ReadonlyMap<number, Point>
): PolygonGeometry | undefined {
	const segments: [Point, Point][] = [];
	let south = Number.POSITIVE_INFINITY;
	let north = Number.NEGATIVE_INFINITY;
	let west = Number.POSITIVE_INFINITY;
	let east = Number.NEGATIVE_INFINITY;
	for (const member of relation.members ?? []) {
		if (member.type !== 'way') continue;
		const refs = ways.get(member.id);
		if (!refs || refs.length < 2) return undefined;
		for (let index = 1; index < refs.length; index += 1) {
			const first = nodes.get(refs[index - 1]);
			const second = nodes.get(refs[index]);
			if (!first || !second) return undefined;
			segments.push([first, second]);
			south = Math.min(south, first.latitude, second.latitude);
			north = Math.max(north, first.latitude, second.latitude);
			west = Math.min(west, first.longitude, second.longitude);
			east = Math.max(east, first.longitude, second.longitude);
		}
	}
	if (segments.length === 0) return undefined;
	return {
		segments,
		box: { south, west, north, east },
		area: (north - south) * (east - west)
	};
}

function geometryForBoundary(
	relation: CandidateEntity,
	ways: ReadonlyMap<number, readonly number[]>,
	nodes: ReadonlyMap<number, Point>
): BoundaryGeometry | undefined {
	const geometry = polygonGeometryForRelation(relation, ways, nodes);
	if (!geometry) return undefined;
	const adminLevel = Number(relation.tags.admin_level) as 4 | 6 | 8;
	return {
		identity: {
			provider: 'openstreetmap',
			elementType: 'relation',
			elementId: relation.id,
			adminLevel,
			name: relation.tags.name,
			countryCode: relation.tags['ISO3166-1'] ?? relation.tags['addr:country'] ?? 'IT'
		},
		source: relation,
		...geometry
	};
}

function normalizedBoundary(boundary: BoundaryGeometry): NormalizedLocalityBoundary {
	const point = {
		latitude: (boundary.box.south + boundary.box.north) / 2,
		longitude: (boundary.box.west + boundary.box.east) / 2
	};
	const contentHash = createHash('sha256')
		.update(
			JSON.stringify({
				identity: [boundary.identity.elementType, boundary.identity.elementId],
				version: boundary.source.version,
				tags: Object.entries(boundary.source.tags).sort(([first], [second]) =>
					first.localeCompare(second)
				),
				box: boundary.box
			})
		)
		.digest('hex');
	return {
		...boundary.identity,
		sourceVersion: boundary.source.version,
		sourceTimestamp: boundary.source.timestamp,
		tags: boundary.source.tags,
		...point,
		contentHash
	};
}

function assignedBoundaries(point: Point, boundaries: BoundarySpatialIndex) {
	const result: Partial<Record<4 | 6 | 8, LocalityBoundaryIdentity>> = {};
	for (const level of [4, 6, 8] as const) {
		const match = boundaries.find(point, level);
		if (match) result[level] = match.identity;
	}
	return result;
}

function distanceMetres(first: NormalizedPlaceInput, second: NormalizedPlaceInput) {
	const radians = (degrees: number) => (degrees * Math.PI) / 180;
	const latitude = radians(second.latitude - first.latitude);
	const longitude = radians(second.longitude - first.longitude);
	const a =
		Math.sin(latitude / 2) ** 2 +
		Math.cos(radians(first.latitude)) *
			Math.cos(radians(second.latitude)) *
			Math.sin(longitude / 2) ** 2;
	return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function flagLikelyDuplicates(inputs: NormalizedPlaceInput[]) {
	const buckets = new Map<string, NormalizedPlaceInput[]>();
	let duplicates = 0;
	for (const input of inputs) {
		if (!input.normalizedName || input.quarantineReason) continue;
		const x = Math.round(input.longitude * 10_000);
		const y = Math.round(input.latitude * 10_000);
		let duplicate: NormalizedPlaceInput | undefined;
		for (let xOffset = -1; xOffset <= 1 && !duplicate; xOffset += 1) {
			for (let yOffset = -1; yOffset <= 1 && !duplicate; yOffset += 1) {
				duplicate = (
					buckets.get(`${input.normalizedName}:${x + xOffset}:${y + yOffset}`) ?? []
				).find((candidate) => distanceMetres(candidate, input) <= 5);
			}
		}
		if (duplicate) {
			input.quarantineReason = `possible-duplicate-of:${duplicate.provider}:${duplicate.elementType}:${duplicate.elementId}`;
			duplicates += 1;
		} else {
			const key = `${input.normalizedName}:${x}:${y}`;
			buckets.set(key, [...(buckets.get(key) ?? []), input]);
		}
	}
	return duplicates;
}

function pointsForCandidate(
	item: CandidateEntity,
	directNodePoints: ReadonlyMap<number, Point>,
	ways: ReadonlyMap<number, readonly number[]>,
	nodes: ReadonlyMap<number, Point>
) {
	if (item.type === 'node') {
		const point = directNodePoints.get(item.id);
		return point ? [point] : [];
	}
	const refs =
		item.type === 'way'
			? (item.refs ?? ways.get(item.id) ?? [])
			: (item.members ?? []).flatMap((member) =>
					member.type === 'node'
						? [member.id]
						: member.type === 'way'
							? (ways.get(member.id) ?? [])
							: []
				);
	return refs.map((reference) => nodes.get(reference)).filter((point) => point !== undefined);
}

export async function prepareRestaurantImport(reader: OsmSourceReader): Promise<PreparedOsmImport> {
	const candidates = new Map<string, CandidateEntity>();
	const boundaryRelations = new Map<number, CandidateEntity>();
	const italyBoundaryRelations = new Map<number, CandidateEntity>();
	const directNodePoints = new Map<number, Point>();
	const requiredWayIds = new Set<number>();
	const observedCountryCodes = new Set<string>();

	await reader.scan((entity) => {
		if (
			entity.type === 'relation' &&
			entity.tags.boundary === 'administrative' &&
			entity.tags.admin_level === '2' &&
			entity.tags['ISO3166-1']
		) {
			const countryCode = entity.tags['ISO3166-1'].toUpperCase();
			observedCountryCodes.add(countryCode);
			if (countryCode === 'IT') {
				const item = candidate(entity);
				italyBoundaryRelations.set(entity.id, item);
				for (const member of entity.members)
					if (member.type === 'way') requiredWayIds.add(member.id);
			}
		}
		if (isRestaurant(entity)) {
			const item = candidate(entity);
			candidates.set(`${entity.type}:${entity.id}`, item);
			if (entity.type === 'node') {
				directNodePoints.set(entity.id, { latitude: entity.lat, longitude: entity.lon });
			} else if (entity.type === 'relation') {
				for (const member of entity.members)
					if (member.type === 'way') requiredWayIds.add(member.id);
			}
		}
		if (isAdministrativeBoundary(entity)) {
			const item = candidate(entity);
			boundaryRelations.set(entity.id, item);
			for (const member of entity.members) if (member.type === 'way') requiredWayIds.add(member.id);
		}
	});
	if (observedCountryCodes.size > 0 && !observedCountryCodes.has('IT')) {
		throw new Error(
			`The PBF does not identify an Italy extract (observed: ${[...observedCountryCodes].sort().join(', ')})`
		);
	}

	const ways = new Map<number, readonly number[]>();
	const requiredNodeIds = new Set<number>();
	await reader.scan((entity) => {
		if (entity.type !== 'way') return;
		const isCandidateWay = candidates.has(`way:${entity.id}`);
		if (!requiredWayIds.has(entity.id) && !isCandidateWay) return;
		ways.set(entity.id, [...entity.refs]);
		for (const reference of entity.refs) requiredNodeIds.add(reference);
	});
	for (const item of candidates.values()) {
		if (item.type === 'relation') {
			for (const member of item.members ?? []) {
				if (member.type === 'node') requiredNodeIds.add(member.id);
			}
		}
	}

	const nodes = new Map<number, Point>(directNodePoints);
	await reader.scan((entity) => {
		if (entity.type === 'node' && requiredNodeIds.has(entity.id)) {
			nodes.set(entity.id, { latitude: entity.lat, longitude: entity.lon });
		}
	});

	const boundaryGeometry = [...boundaryRelations.values()]
		.map((relation) => geometryForBoundary(relation, ways, nodes))
		.filter((geometry) => geometry !== undefined);
	const italyBoundaryGeometry = [...italyBoundaryRelations.values()]
		.map((relation) => polygonGeometryForRelation(relation, ways, nodes))
		.filter((geometry) => geometry !== undefined);
	if (observedCountryCodes.has('IT') && italyBoundaryGeometry.length === 0) {
		throw new Error('The Italy boundary relation has no usable geometry');
	}
	const boundaryIndex = new BoundarySpatialIndex(boundaryGeometry);
	const normalized: NormalizedPlaceInput[] = [];
	let missingGeometry = 0;
	let outsideItaly = 0;
	for (const item of candidates.values()) {
		const point = representativePoint(pointsForCandidate(item, directNodePoints, ways, nodes));
		if (!point) {
			missingGeometry += 1;
			continue;
		}
		const source: SourceSnapshotInput = {
			provider: 'openstreetmap',
			elementType: item.type,
			elementId: item.id,
			category: 'restaurant',
			dataClass: 'real',
			sourceVersion: item.version,
			sourceTimestamp: item.timestamp,
			tags: item.tags,
			...point
		};
		const normalizedPlace = normalizeOsmPlace(source, assignedBoundaries(point, boundaryIndex));
		if (
			italyBoundaryGeometry.length > 0 &&
			!italyBoundaryGeometry.some((boundary) => inside(point, boundary))
		) {
			normalizedPlace.quarantineReason = 'outside-italy-boundary';
			outsideItaly += 1;
		}
		normalized.push(normalizedPlace);
	}
	normalized.sort(
		(first, second) =>
			first.elementType.localeCompare(second.elementType) || first.elementId - second.elementId
	);
	const possibleDuplicates = flagLikelyDuplicates(normalized);
	const quarantined = normalized.filter((place) => place.quarantineReason).length;
	return {
		places: normalized,
		boundaries: boundaryGeometry.map(normalizedBoundary),
		statistics: {
			candidates: candidates.size,
			normalized: normalized.length,
			active: normalized.length - quarantined,
			quarantined,
			possibleDuplicates,
			missingGeometry,
			outsideItaly,
			boundaryRelations: boundaryGeometry.length,
			municipalityIdentity: normalized.filter((item) => item.locality.municipality).length
		}
	};
}

async function checksum(path: string) {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest('hex');
}

export class OsmRestaurantImporter {
	constructor(
		private readonly catalogue: CatalogueRepository,
		private readonly clock: () => Date = () => new Date()
	) {}

	async importPbf(path: string): Promise<OsmImportResult> {
		const sourceChecksum = await checksum(path);
		const startedAt = this.clock();
		const importId = newApplicationId();
		const start = await this.catalogue.startImport({
			id: importId,
			category: 'restaurant',
			dataClass: 'real',
			sourceUri: path,
			sourceChecksum,
			normalizerVersion: CATALOGUE_NORMALIZER_VERSION,
			localityIndexVersion: LOCALITY_INDEX_VERSION,
			startedAt
		});
		if (start.reused && start.record.status === 'promoted') {
			return { importId: start.record.id, reused: true, statistics: start.record.statistics };
		}
		const effectiveImportId = start.record.id;
		if (start.reused) await this.catalogue.resumeImport(effectiveImportId, startedAt);

		try {
			const prepared = await prepareRestaurantImport(new PbfSourceReader(path));
			await this.catalogue.stagePlaces(effectiveImportId, prepared.places, prepared.boundaries);
			await this.catalogue.promote(
				effectiveImportId,
				prepared.places,
				prepared.boundaries,
				prepared.statistics,
				this.clock()
			);
			return { importId: effectiveImportId, reused: start.reused, statistics: prepared.statistics };
		} catch (error) {
			await this.catalogue.failImport(
				effectiveImportId,
				error instanceof Error ? error.message : String(error),
				this.clock()
			);
			throw error;
		}
	}
}

export const __test = { inside };
