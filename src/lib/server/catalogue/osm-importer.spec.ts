import { describe, expect, it } from 'vitest';
import type { OsmEntity, OsmSourceReader } from './pbf';
import { prepareRestaurantImport } from './osm-importer';

class FixtureReader implements OsmSourceReader {
	constructor(private readonly entities: readonly OsmEntity[]) {}
	async scan(visitor: (entity: OsmEntity) => void) {
		for (const entity of this.entities) visitor(structuredClone(entity));
	}
}

const info = { version: 1, timestamp: Date.parse('2026-08-14T00:00:00.000Z') };

describe('repeatable OSM restaurant preparation', () => {
	it('normalizes nodes, ways and relations and assigns OSM boundary identities', async () => {
		const entities: OsmEntity[] = [
			{ type: 'node', id: 1, lat: 0, lon: 0, tags: {}, info },
			{ type: 'node', id: 2, lat: 0, lon: 10, tags: {}, info },
			{ type: 'node', id: 3, lat: 10, lon: 10, tags: {}, info },
			{ type: 'node', id: 4, lat: 10, lon: 0, tags: {}, info },
			{
				type: 'node',
				id: 100,
				lat: 5,
				lon: 5,
				tags: { amenity: 'restaurant', name: 'Caffè Uno', 'addr:city': 'Testo' },
				info
			},
			{ type: 'node', id: 101, lat: 4, lon: 4, tags: {}, info },
			{ type: 'node', id: 102, lat: 6, lon: 6, tags: {}, info },
			{
				type: 'way',
				id: 200,
				refs: [101, 102],
				tags: { amenity: 'restaurant', name: 'Due' },
				info
			},
			{ type: 'way', id: 10, refs: [1, 2, 3, 4, 1], tags: {}, info },
			{
				type: 'relation',
				id: 300,
				members: [{ type: 'way', id: 10, role: 'outer' }],
				tags: { boundary: 'administrative', admin_level: '8', name: 'Comune Test' },
				info
			}
		];
		const result = await prepareRestaurantImport(new FixtureReader(entities));

		expect(result.places).toHaveLength(2);
		expect(result.places.map((place) => place.name)).toEqual(['Caffè Uno', 'Due']);
		expect(result.places.every((place) => place.locality.municipality?.elementId === 300)).toBe(
			true
		);
		expect(result.statistics).toMatchObject({
			candidates: 2,
			normalized: 2,
			active: 2,
			missingGeometry: 0,
			boundaryRelations: 1,
			municipalityIdentity: 2
		});
	});

	it('reports missing relation geometry rather than inventing a point', async () => {
		const result = await prepareRestaurantImport(
			new FixtureReader([
				{
					type: 'relation',
					id: 9,
					members: [{ type: 'relation', id: 10, role: '' }],
					tags: { amenity: 'restaurant', name: 'Missing' },
					info
				}
			])
		);
		expect(result.places).toEqual([]);
		expect(result.statistics.missingGeometry).toBe(1);
	});

	it('computes large administrative bounds without overflowing the call stack', async () => {
		const nodeCount = 70_000;
		const refs = Array.from({ length: nodeCount }, (_, index) => index + 1);
		const reader: OsmSourceReader = {
			async scan(visitor) {
				for (const id of refs) {
					visitor({
						type: 'node',
						id,
						lat: 40 + (id % 1_000) / 10_000,
						lon: 8 + Math.floor(id / 1_000) / 10_000,
						tags: {},
						info
					});
				}
				visitor({ type: 'way', id: 10, refs, tags: {}, info });
				visitor({
					type: 'relation',
					id: 300,
					members: [{ type: 'way', id: 10, role: 'outer' }],
					tags: { boundary: 'administrative', admin_level: '8', name: 'Large Comune' },
					info
				});
			}
		};

		const result = await prepareRestaurantImport(reader);

		expect(result.statistics.boundaryRelations).toBe(1);
		expect(result.boundaries).toHaveLength(1);
	});

	it('quarantines restaurants from a country-extract border buffer', async () => {
		const result = await prepareRestaurantImport(
			new FixtureReader([
				{ type: 'node', id: 1, lat: 40, lon: 8, tags: {}, info },
				{ type: 'node', id: 2, lat: 40, lon: 10, tags: {}, info },
				{ type: 'node', id: 3, lat: 42, lon: 10, tags: {}, info },
				{ type: 'node', id: 4, lat: 42, lon: 8, tags: {}, info },
				{
					type: 'node',
					id: 100,
					lat: 41,
					lon: 9,
					tags: { amenity: 'restaurant', name: 'Inside' },
					info
				},
				{
					type: 'node',
					id: 101,
					lat: 43,
					lon: 9,
					tags: { amenity: 'restaurant', name: 'Outside' },
					info
				},
				{ type: 'way', id: 10, refs: [1, 2, 3, 4, 1], tags: {}, info },
				{
					type: 'relation',
					id: 300,
					members: [{ type: 'way', id: 10, role: 'outer' }],
					tags: {
						boundary: 'administrative',
						admin_level: '2',
						name: 'Italia',
						'ISO3166-1': 'IT'
					},
					info
				}
			])
		);

		expect(
			result.places.find((place) => place.name === 'Inside')?.quarantineReason
		).toBeUndefined();
		expect(result.places.find((place) => place.name === 'Outside')?.quarantineReason).toBe(
			'outside-italy-boundary'
		);
		expect(result.statistics.outsideItaly).toBe(1);
	});

	it('discards clipped administrative relations with missing member ways', async () => {
		const result = await prepareRestaurantImport(
			new FixtureReader([
				{ type: 'node', id: 1, lat: 40, lon: 8, tags: {}, info },
				{ type: 'node', id: 2, lat: 40, lon: 10, tags: {}, info },
				{ type: 'way', id: 10, refs: [1, 2], tags: {}, info },
				{
					type: 'relation',
					id: 300,
					members: [
						{ type: 'way', id: 10, role: 'outer' },
						{ type: 'way', id: 11, role: 'outer' }
					],
					tags: { boundary: 'administrative', admin_level: '4', name: 'Clipped Region' },
					info
				}
			])
		);

		expect(result.statistics.boundaryRelations).toBe(0);
		expect(result.boundaries).toEqual([]);
	});

	it('flags near-identical source identities for review without merging them', async () => {
		const result = await prepareRestaurantImport(
			new FixtureReader([
				{
					type: 'node',
					id: 1,
					lat: 45,
					lon: 9,
					tags: { amenity: 'restaurant', name: 'Same Place' },
					info
				},
				{
					type: 'node',
					id: 2,
					lat: 45.00001,
					lon: 9.00001,
					tags: { amenity: 'restaurant', name: 'Same Place' },
					info
				}
			])
		);

		expect(result.places).toHaveLength(2);
		expect(result.places[0].quarantineReason).toBeUndefined();
		expect(result.places[1].quarantineReason).toContain('possible-duplicate-of');
		expect(result.statistics.possibleDuplicates).toBe(1);
	});

	it('rejects a source that positively identifies a different country extract', async () => {
		await expect(
			prepareRestaurantImport(
				new FixtureReader([
					{
						type: 'relation',
						id: 1,
						members: [],
						tags: {
							boundary: 'administrative',
							admin_level: '2',
							name: 'Elsewhere',
							'ISO3166-1': 'XX'
						},
						info
					}
				])
			)
		).rejects.toThrow('does not identify an Italy extract');
	});
});
