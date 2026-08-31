import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { normalizeOsmPlace } from '$lib/domain/catalogue/normalization';
import { createDatabase } from '$lib/server/db/connection';
import { CatalogueRepository } from './catalogue';
import { MapCatalogueRepository } from './map-catalogue';

const now = new Date('2026-08-31T12:00:00.000Z');
const connection = createDatabase(process.env.DATABASE_URL!);
const { db } = connection;

function restaurant(elementId: number, name: string, latitude: number, longitude: number) {
	return normalizeOsmPlace({
		provider: 'openstreetmap',
		elementType: 'node',
		elementId,
		category: 'restaurant',
		dataClass: 'synthetic',
		sourceVersion: 1,
		sourceTimestamp: now,
		tags: {
			amenity: 'restaurant',
			name,
			'addr:street': 'Via Test',
			'addr:housenumber': String(elementId),
			'addr:city': 'Bologna'
		},
		latitude,
		longitude
	});
}

async function seedRestaurants() {
	const items = [
		restaurant(1, 'One', 44.4938, 11.3426),
		restaurant(2, 'Two', 44.494, 11.343),
		restaurant(3, 'Three', 45.4642, 9.19)
	];
	const catalogue = new CatalogueRepository(db);
	await catalogue.startImport({
		id: 'map-catalogue-import',
		category: 'restaurant',
		dataClass: 'synthetic',
		sourceUri: 'fixture://map-catalogue',
		sourceChecksum: 'map-catalogue-checksum',
		normalizerVersion: 'test-v1',
		localityIndexVersion: 'test-v1',
		startedAt: now
	});
	await catalogue.stagePlaces('map-catalogue-import', items);
	await catalogue.promote('map-catalogue-import', items, [], { normalized: items.length }, now);
}

beforeEach(async () => {
	await db.execute(sql`truncate table "catalogue_import", "place" cascade`);
	await seedRestaurants();
});

afterAll(async () => {
	await connection.close();
});

describe('map catalogue viewport', () => {
	it('returns every individual restaurant in a street-level viewport with address data', async () => {
		const repository = new MapCatalogueRepository(db);
		const result = await repository.viewport({
			dataClass: 'synthetic',
			bounds: { south: 44.48, west: 11.32, north: 44.51, east: 11.36 },
			zoom: 15
		});
		expect(result.mode).toBe('places');
		if (result.mode !== 'places') throw new Error('Expected individual map places');
		expect(result.places.map((place) => place.name)).toEqual(['One', 'Two']);
		expect(result.places.every((place) => place.addressLabel?.includes('Via Test'))).toBe(true);
	});

	it('represents every restaurant through exact clusters at regional zoom', async () => {
		const repository = new MapCatalogueRepository(db);
		const result = await repository.viewport({
			dataClass: 'synthetic',
			bounds: { south: 35, west: 6, north: 48, east: 19 },
			zoom: 5
		});
		expect(result.mode).toBe('clusters');
		if (result.mode !== 'clusters') throw new Error('Expected clustered map places');
		expect(result.clusters.reduce((total, cluster) => total + cluster.count, 0)).toBe(3);
	});
});
