import { describe, expect, it, vi } from 'vitest';
import { NominatimGeocoder } from './geocoding';

describe('NominatimGeocoder', () => {
	it('normalizes a bounded Italy search and caches repeated queries', async () => {
		let now = 2_000;
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						place_id: 42,
						display_name: 'Bologna, Emilia-Romagna, Italia',
						lat: '44.4938',
						lon: '11.3426',
						boundingbox: ['44.40', '44.58', '11.22', '11.45']
					}
				])
			)
		);
		const geocoder = new NominatimGeocoder(
			'https://nominatim.example.test',
			'https://gustimei.example.test',
			fetcher,
			() => now,
			async (duration) => {
				now += duration;
			}
		);
		const first = await geocoder.search('  Bologna  ', 'it');
		const second = await geocoder.search('bologna', 'it');
		expect(first).toEqual(second);
		expect(first[0]?.bounds).toEqual([44.4, 11.22, 44.58, 11.45]);
		expect(fetcher).toHaveBeenCalledOnce();
		const requested = fetcher.mock.calls[0]?.[0] as URL;
		expect(requested.searchParams.get('countrycodes')).toBe('it');
		expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
			'User-Agent': 'GustiMei/0.0.1 (+https://gustimei.example.test)'
		});
	});

	it('rejects queries that should not reach the external provider', async () => {
		const geocoder = new NominatimGeocoder('https://example.test', 'https://gustimei.test');
		await expect(geocoder.search(' ', 'en')).rejects.toThrow('between 2 and 160');
	});
});
