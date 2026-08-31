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
