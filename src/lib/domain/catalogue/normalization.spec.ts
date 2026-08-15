import { describe, expect, it } from 'vitest';
import { normalizeOsmPlace, normalizeSearchText } from './normalization';

describe('OSM catalogue normalization', () => {
	it('creates accent-insensitive stable search text', () => {
		expect(normalizeSearchText('  Caffè dell’Etna — Centro  ')).toBe('caffe dell etna centro');
	});

	it('prefers stable administrative identities and retains text fallback', () => {
		const result = normalizeOsmPlace(
			{
				provider: 'openstreetmap',
				elementType: 'node',
				elementId: 42,
				category: 'restaurant',
				dataClass: 'real',
				sourceVersion: 3,
				tags: {
					name: 'Trattoria Èlite',
					'addr:city': 'Firenze',
					'addr:postcode': '50122',
					'addr:street': 'Via Roma',
					'addr:housenumber': '1'
				},
				latitude: 43.77,
				longitude: 11.25
			},
			{
				4: {
					provider: 'openstreetmap',
					elementType: 'relation',
					elementId: 41977,
					adminLevel: 4,
					name: 'Toscana',
					countryCode: 'IT'
				},
				8: {
					provider: 'openstreetmap',
					elementType: 'relation',
					elementId: 42602,
					adminLevel: 8,
					name: 'Firenze',
					countryCode: 'IT'
				}
			}
		);

		expect(result.normalizedName).toBe('trattoria elite');
		expect(result.addressLabel).toBe('Via Roma 1');
		expect(result.locality.displayLabel).toBe('Firenze, Toscana');
		expect(result.locality.searchText).toContain('50122');
		expect(result.quarantineReason).toBeUndefined();
	});

	it('quarantines records that would create unusable identities', () => {
		const result = normalizeOsmPlace({
			provider: 'openstreetmap',
			elementType: 'way',
			elementId: 7,
			category: 'restaurant',
			dataClass: 'real',
			sourceVersion: 1,
			tags: { amenity: 'restaurant' },
			latitude: 45,
			longitude: 9
		});

		expect(result.quarantineReason).toBe('missing-name');
	});
});
