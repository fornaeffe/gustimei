import { describe, expect, it } from 'vitest';
import { isLicensedCatalogueImage, OPENSTREETMAP_ATTRIBUTION } from './licensing';

describe('catalogue licensing boundary', () => {
	it('publishes the required OpenStreetMap attribution contract', () => {
		expect(OPENSTREETMAP_ATTRIBUTION.label).toContain('OpenStreetMap contributors');
		expect(OPENSTREETMAP_ATTRIBUTION.url).toBe('https://www.openstreetmap.org/copyright');
	});

	it('rejects image URLs without complete licence provenance', () => {
		expect(isLicensedCatalogueImage({ url: 'https://example.test/photo.jpg' })).toBe(false);
		expect(
			isLicensedCatalogueImage({
				url: 'https://example.test/photo.jpg',
				sourceUrl: 'https://example.test/source',
				attribution: 'Example author',
				licence: 'CC BY 4.0'
			})
		).toBe(true);
	});
});
