import { describe, expect, it } from 'vitest';
import { isPlaceInBounds, nearbyRecommendationOrder, topNearbyCount } from './map';

describe('map recommendation scope', () => {
	it('preserves global recommendation order while filtering to the viewport', () => {
		const ordered = [
			{ id: 'first', latitude: 44.5, longitude: 11.3 },
			{ id: 'outside', latitude: 45.5, longitude: 9.2 },
			{ id: 'third', latitude: 44.4, longitude: 11.4 }
		];
		expect(
			nearbyRecommendationOrder(ordered, { south: 44, west: 11, north: 45, east: 12 }).map(
				(place) => place.id
			)
		).toEqual(['first', 'third']);
	});

	it('uses the smallest enclosing integer for the top ten percent', () => {
		expect(topNearbyCount(0)).toBe(0);
		expect(topNearbyCount(1)).toBe(1);
		expect(topNearbyCount(10)).toBe(1);
		expect(topNearbyCount(11)).toBe(2);
	});

	it('supports viewports that cross the antimeridian', () => {
		expect(
			isPlaceInBounds(
				{ latitude: 0, longitude: 179 },
				{ south: -1, west: 170, north: 1, east: -170 }
			)
		).toBe(true);
	});
});
