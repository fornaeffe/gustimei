export interface MapBounds {
	south: number;
	west: number;
	north: number;
	east: number;
}

export interface PositionedPlace {
	latitude: number;
	longitude: number;
}

export type MapRecommendationStatus = 'top' | 'ranked' | 'unranked';

export const INDIVIDUAL_RESTAURANT_ZOOM = 13;
export const MAX_INDIVIDUAL_RESTAURANTS = 2_000;
const TARGET_VIEWPORT_CLUSTER_CELLS = 600;

export function clusterCellSize(zoom: number) {
	if (zoom < INDIVIDUAL_RESTAURANT_ZOOM) {
		return 3 / 2 ** Math.max(0, zoom - 5);
	}
	return Math.max(0.001, 0.008 / 2 ** Math.max(0, zoom - INDIVIDUAL_RESTAURANT_ZOOM));
}

export function viewportClusterCellSize(bounds: MapBounds, zoom: number) {
	const area = Math.max(0, bounds.north - bounds.south) * Math.max(0, bounds.east - bounds.west);
	return Math.max(clusterCellSize(zoom), Math.sqrt(area / TARGET_VIEWPORT_CLUSTER_CELLS));
}

export function recommendationStatus(
	nearbyPosition: number | undefined,
	nearbyRecommendationCount: number
): MapRecommendationStatus {
	if (nearbyPosition === undefined) return 'unranked';
	return nearbyPosition <= topNearbyCount(nearbyRecommendationCount) ? 'top' : 'ranked';
}

export function isPlaceInBounds(place: PositionedPlace, bounds: MapBounds) {
	const withinLatitude = place.latitude >= bounds.south && place.latitude <= bounds.north;
	const withinLongitude =
		bounds.west <= bounds.east
			? place.longitude >= bounds.west && place.longitude <= bounds.east
			: place.longitude >= bounds.west || place.longitude <= bounds.east;
	return withinLatitude && withinLongitude;
}

export function nearbyRecommendationOrder<T extends PositionedPlace>(
	globallyOrderedPlaces: readonly T[],
	bounds: MapBounds
) {
	return globallyOrderedPlaces.filter((place) => isPlaceInBounds(place, bounds));
}

export function topNearbyCount(nearbyCount: number) {
	return nearbyCount <= 0 ? 0 : Math.max(1, Math.ceil(nearbyCount * 0.1));
}
