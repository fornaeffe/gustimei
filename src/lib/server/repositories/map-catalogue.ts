import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import {
	INDIVIDUAL_RESTAURANT_ZOOM,
	MAX_INDIVIDUAL_RESTAURANTS,
	viewportClusterCellSize
} from '$lib/domain/recommendations/map';
import type { DataClass } from '$lib/domain/catalogue/contracts';
import type { Database } from '$lib/server/db';
import { effectivePlace, place } from '$lib/server/db/schema';

export interface RestaurantMapBounds {
	south: number;
	west: number;
	north: number;
	east: number;
}

export interface RestaurantMapPoint {
	placeId: string;
	name: string;
	addressLabel?: string;
	displayLocality: string;
	latitude: number;
	longitude: number;
}

export interface RestaurantMapCluster {
	id: string;
	count: number;
	latitude: number;
	longitude: number;
	bounds: RestaurantMapBounds;
}

export type RestaurantViewport =
	| { mode: 'places'; places: RestaurantMapPoint[] }
	| { mode: 'clusters'; clusters: RestaurantMapCluster[]; places: RestaurantMapPoint[] };

export class MapCatalogueRepository {
	constructor(private readonly database: Database) {}

	private filters(dataClass: DataClass, bounds: RestaurantMapBounds) {
		return and(
			eq(effectivePlace.category, 'restaurant'),
			eq(effectivePlace.status, 'active'),
			eq(place.dataClass, dataClass),
			gte(effectivePlace.latitude, bounds.south),
			lte(effectivePlace.latitude, bounds.north),
			gte(effectivePlace.longitude, bounds.west),
			lte(effectivePlace.longitude, bounds.east)
		);
	}

	async viewport(input: { dataClass: DataClass; bounds: RestaurantMapBounds; zoom: number }) {
		if (input.zoom >= INDIVIDUAL_RESTAURANT_ZOOM) {
			const rows = await this.database
				.select({
					placeId: effectivePlace.placeId,
					name: effectivePlace.name,
					addressLabel: effectivePlace.addressLabel,
					displayLocality: effectivePlace.displayLocality,
					latitude: effectivePlace.latitude,
					longitude: effectivePlace.longitude
				})
				.from(effectivePlace)
				.innerJoin(place, eq(place.id, effectivePlace.placeId))
				.where(this.filters(input.dataClass, input.bounds))
				.orderBy(asc(effectivePlace.placeId))
				.limit(MAX_INDIVIDUAL_RESTAURANTS + 1);
			if (rows.length <= MAX_INDIVIDUAL_RESTAURANTS) {
				return {
					mode: 'places',
					places: rows.map((row) => ({
						...row,
						addressLabel: row.addressLabel ?? undefined
					}))
				} satisfies RestaurantViewport;
			}
		}
		return this.clustered(input);
	}

	private async clustered(input: {
		dataClass: DataClass;
		bounds: RestaurantMapBounds;
		zoom: number;
	}) {
		const size = viewportClusterCellSize(input.bounds, input.zoom);
		const cells = this.database
			.select({
				latitudeCell: sql<number>`floor((${effectivePlace.latitude} + 90) / ${size})::integer`.as(
					'latitude_cell'
				),
				longitudeCell:
					sql<number>`floor((${effectivePlace.longitude} + 180) / ${size})::integer`.as(
						'longitude_cell'
					),
				placeId: effectivePlace.placeId,
				name: effectivePlace.name,
				addressLabel: effectivePlace.addressLabel,
				displayLocality: effectivePlace.displayLocality,
				latitude: effectivePlace.latitude,
				longitude: effectivePlace.longitude
			})
			.from(effectivePlace)
			.innerJoin(place, eq(place.id, effectivePlace.placeId))
			.where(this.filters(input.dataClass, input.bounds))
			.as('restaurant_map_cells');
		const rows = await this.database
			.select({
				latitudeCell: cells.latitudeCell,
				longitudeCell: cells.longitudeCell,
				count: sql<number>`count(*)::integer`,
				placeId: sql<string>`min(${cells.placeId})`,
				name: sql<string>`min(${cells.name})`,
				addressLabel: sql<string | null>`min(${cells.addressLabel})`,
				displayLocality: sql<string>`min(${cells.displayLocality})`,
				latitude: sql<number>`avg(${cells.latitude})::double precision`,
				longitude: sql<number>`avg(${cells.longitude})::double precision`,
				south: sql<number>`min(${cells.latitude})::double precision`,
				west: sql<number>`min(${cells.longitude})::double precision`,
				north: sql<number>`max(${cells.latitude})::double precision`,
				east: sql<number>`max(${cells.longitude})::double precision`
			})
			.from(cells)
			.groupBy(cells.latitudeCell, cells.longitudeCell)
			.orderBy(cells.latitudeCell, cells.longitudeCell)
			.limit(2_500);
		return {
			mode: 'clusters',
			clusters: rows
				.filter((row) => row.count > 1)
				.map((row) => ({
					id: `${row.latitudeCell}:${row.longitudeCell}`,
					count: row.count,
					latitude: row.latitude,
					longitude: row.longitude,
					bounds: { south: row.south, west: row.west, north: row.north, east: row.east }
				})),
			places: rows
				.filter((row) => row.count === 1)
				.map((row) => ({
					placeId: row.placeId,
					name: row.name,
					addressLabel: row.addressLabel ?? undefined,
					displayLocality: row.displayLocality,
					latitude: row.latitude,
					longitude: row.longitude
				}))
		} satisfies RestaurantViewport;
	}
}
