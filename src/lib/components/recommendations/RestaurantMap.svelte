<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import type { LayerGroup, Map as LeafletMap, Marker } from 'leaflet';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import {
		isPlaceInBounds,
		nearbyRecommendationOrder,
		recommendationStatus,
		topNearbyCount,
		type MapBounds,
		type MapRecommendationStatus
	} from '$lib/domain/recommendations/map';
	import * as m from '$lib/paraglide/messages';

	interface RecommendationPlace {
		placeId: string;
		name: string;
		displayLocality: string;
		addressLabel?: string;
		latitude: number;
		longitude: number;
		visited: boolean;
		supported: boolean;
		predictedPosition: number;
	}

	interface RestaurantMapPoint {
		placeId: string;
		name: string;
		addressLabel?: string;
		displayLocality: string;
		latitude: number;
		longitude: number;
	}

	interface RestaurantMapCluster {
		id: string;
		count: number;
		latitude: number;
		longitude: number;
		bounds: MapBounds;
	}

	type RestaurantViewport =
		| { mode: 'places'; places: RestaurantMapPoint[] }
		| { mode: 'clusters'; clusters: RestaurantMapCluster[] };

	interface GeocodingResult {
		id: string;
		label: string;
		latitude: number;
		longitude: number;
		bounds: [number, number, number, number];
	}

	let {
		places,
		tileUrl,
		artifactId
	}: { places: RecommendationPlace[]; tileUrl: string; artifactId: string } = $props();
	let map: LeafletMap | undefined;
	let leaflet: typeof import('leaflet') | undefined;
	let catalogueLayer: LayerGroup | undefined;
	let emphasisLayer: LayerGroup | undefined;
	let viewport = $state<RestaurantViewport>();
	let nearby = $state<RecommendationPlace[]>([]);
	let locationQuery = $state('');
	let locationResults = $state<GeocodingResult[]>([]);
	let searchState = $state<'idle' | 'loading' | 'empty' | 'error'>('idle');
	let mapState = $state<'loading' | 'ready' | 'error'>('loading');
	let topCount = $derived(topNearbyCount(nearby.length));
	let moveTimer: ReturnType<typeof setTimeout> | undefined;
	let viewportController: AbortController | undefined;
	let viewportSequence = 0;
	let pendingOpenPlaceId: string | undefined;
	let locale = $derived(getLocale());
	const markers = new SvelteMap<string, Marker>();
	const reportedExposures = new SvelteSet<string>();
	const rankedPlaces = $derived(places.filter((place) => place.supported));
	const visitedIds = $derived(
		new SvelteSet(places.filter((place) => place.visited).map((place) => place.placeId))
	);

	function placeAddress(place: { addressLabel?: string; displayLocality: string }) {
		return place.addressLabel || place.displayLocality;
	}

	function placeHref(placeId: string) {
		return localizeHref(`/places/${encodeURIComponent(placeId)}`, { locale });
	}

	function currentBounds(): MapBounds | undefined {
		if (!map) return undefined;
		const bounds = map.getBounds();
		return {
			south: bounds.getSouth(),
			west: bounds.getWest(),
			north: bounds.getNorth(),
			east: bounds.getEast()
		};
	}

	function nearbyPositionById() {
		return new SvelteMap(nearby.map((place, index) => [place.placeId, index + 1]));
	}

	function popupContent(
		place: RestaurantMapPoint | RecommendationPlace,
		status: MapRecommendationStatus,
		nearbyPosition?: number
	) {
		const content = document.createElement('div');
		content.className = 'map-popup';
		const link = document.createElement('a');
		link.href = placeHref(place.placeId);
		link.className = 'map-popup__title';
		link.textContent = place.name;
		content.append(link);
		const address = document.createElement('p');
		address.textContent = placeAddress(place);
		content.append(address);
		const state = document.createElement('p');
		state.className = 'map-popup__state';
		state.textContent = visitedIds.has(place.placeId) ? `✓ ${m.visited()}` : m.not_visited();
		content.append(state);
		const recommendation = document.createElement('strong');
		recommendation.className = `map-popup__rank map-popup__rank--${status}`;
		recommendation.textContent =
			status === 'top'
				? `${m.map_top_nearby()} · ${m.map_nearby_rank({ position: nearbyPosition ?? 1 })}`
				: status === 'ranked'
					? `${m.map_ranked_restaurant()} · ${m.map_nearby_rank({ position: nearbyPosition ?? 1 })}`
					: m.map_unranked_restaurant();
		content.append(recommendation);
		return content;
	}

	function recommendationLabel(status: MapRecommendationStatus) {
		return status === 'top'
			? m.map_top_nearby()
			: status === 'ranked'
				? m.map_ranked_restaurant()
				: m.map_unranked_restaurant();
	}

	function restaurantIcon(status: MapRecommendationStatus, visited: boolean) {
		if (!leaflet) return undefined;
		const symbol = visited ? '✓' : status === 'top' ? '★' : status === 'ranked' ? '•' : '';
		return leaflet.divIcon({
			className: '',
			html: `<span class="restaurant-marker restaurant-marker--${status}${visited ? ' restaurant-marker--visited' : ''}" aria-hidden="true"><span>${symbol}</span></span>`,
			iconSize: status === 'top' ? [26, 26] : [22, 22],
			iconAnchor: status === 'top' ? [13, 13] : [11, 11]
		});
	}

	function addRestaurantMarker(
		place: RestaurantMapPoint | RecommendationPlace,
		status: MapRecommendationStatus,
		nearbyPosition: number | undefined,
		layer: LayerGroup
	) {
		if (!leaflet) return;
		const icon = restaurantIcon(status, visitedIds.has(place.placeId));
		if (!icon) return;
		const marker = leaflet.marker([place.latitude, place.longitude], {
			icon,
			title: `${place.name} — ${visitedIds.has(place.placeId) ? m.visited() : m.not_visited()} — ${recommendationLabel(status)}`,
			keyboard: true,
			riseOnHover: true
		});
		marker.bindTooltip(popupContent(place, status, nearbyPosition), { direction: 'top' });
		marker.bindPopup(popupContent(place, status, nearbyPosition), { minWidth: 220 });
		marker.addTo(layer);
		markers.set(place.placeId, marker);
		if (pendingOpenPlaceId === place.placeId) {
			marker.openPopup();
			pendingOpenPlaceId = undefined;
		}
	}

	function clusterContent(cluster: RestaurantMapCluster) {
		const inCluster = places.filter((place) => isPlaceInBounds(place, cluster.bounds));
		const topIds = new Set(nearby.slice(0, topCount).map((place) => place.placeId));
		const visitedCount = inCluster.filter((place) => place.visited).length;
		const rankedCount = inCluster.filter((place) => place.supported).length;
		const topRecommendationCount = inCluster.filter((place) => topIds.has(place.placeId)).length;
		return { visitedCount, rankedCount, topRecommendationCount };
	}

	function renderViewport() {
		if (!leaflet || !map || !viewport || !catalogueLayer || !emphasisLayer) return;
		catalogueLayer.clearLayers();
		emphasisLayer.clearLayers();
		markers.clear();
		const positionById = nearbyPositionById();
		if (viewport.mode === 'places') {
			for (const place of viewport.places) {
				const position = positionById.get(place.placeId);
				addRestaurantMarker(
					place,
					recommendationStatus(position, nearby.length),
					position,
					catalogueLayer
				);
			}
			return;
		}
		for (const cluster of viewport.clusters) {
			const summary = clusterContent(cluster);
			const icon = leaflet.divIcon({
				className: '',
				html: `<span class="restaurant-cluster${summary.topRecommendationCount ? ' restaurant-cluster--top' : ''}${summary.visitedCount ? ' restaurant-cluster--visited' : ''}" aria-hidden="true"><strong>${cluster.count}</strong>${summary.visitedCount ? `<small>✓ ${summary.visitedCount}</small>` : ''}</span>`,
				iconSize: [48, 48],
				iconAnchor: [24, 24]
			});
			const marker = leaflet.marker([cluster.latitude, cluster.longitude], {
				icon,
				keyboard: true,
				title: m.map_cluster_restaurants({ count: cluster.count })
			});
			const content = document.createElement('div');
			content.className = 'map-popup';
			const total = document.createElement('strong');
			total.textContent = m.map_cluster_restaurants({ count: cluster.count });
			content.append(total);
			if (summary.visitedCount) {
				const visited = document.createElement('p');
				visited.textContent = `✓ ${m.map_cluster_visited({ count: summary.visitedCount })}`;
				content.append(visited);
			}
			if (summary.rankedCount) {
				const ranked = document.createElement('p');
				ranked.textContent = m.map_cluster_ranked({ count: summary.rankedCount });
				content.append(ranked);
			}
			marker.bindTooltip(content, { direction: 'top' });
			marker.on('click', () => {
				const clusterBounds = leaflet?.latLngBounds(
					[cluster.bounds.south, cluster.bounds.west],
					[cluster.bounds.north, cluster.bounds.east]
				);
				if (!map || !clusterBounds) return;
				if (clusterBounds.getNorthEast().equals(clusterBounds.getSouthWest())) {
					map.setView([cluster.latitude, cluster.longitude], Math.min(19, map.getZoom() + 2));
				} else {
					map.fitBounds(clusterBounds.pad(0.35), { maxZoom: 15 });
				}
			});
			marker.addTo(catalogueLayer);
		}
		const emphasized = places.filter((place) => {
			const position = positionById.get(place.placeId);
			return place.visited || recommendationStatus(position, nearby.length) === 'top';
		});
		for (const place of emphasized) {
			const position = positionById.get(place.placeId);
			addRestaurantMarker(
				place,
				recommendationStatus(position, nearby.length),
				position,
				emphasisLayer
			);
		}
	}

	function refreshNearby() {
		const bounds = currentBounds();
		if (!bounds) return;
		nearby = nearbyRecommendationOrder(rankedPlaces, bounds);
		renderViewport();
	}

	function recordVisibleExposures() {
		if (!viewport) return;
		const visibleRecommendations =
			viewport.mode === 'places' ? nearby : nearby.slice(0, topNearbyCount(nearby.length));
		const newlyExposed = visibleRecommendations.filter(
			(place) => !place.visited && !reportedExposures.has(place.placeId)
		);
		if (newlyExposed.length > 0) {
			const exposure = new FormData();
			exposure.set('artifactId', artifactId);
			for (const place of newlyExposed) {
				reportedExposures.add(place.placeId);
				exposure.append('placeId', place.placeId);
			}
			void fetch('?/exposed', { method: 'POST', body: exposure });
		}
	}

	async function loadViewport() {
		if (!map) return;
		const bounds = currentBounds();
		if (!bounds) return;
		viewportController?.abort();
		viewportController = new AbortController();
		const sequence = ++viewportSequence;
		try {
			const response = await fetch(localizeHref('/api/restaurants/map', { locale }), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bounds, zoom: map.getZoom() }),
				signal: viewportController.signal
			});
			if (!response.ok) throw new Error('Restaurant map request failed');
			const result = (await response.json()) as RestaurantViewport;
			if (sequence !== viewportSequence) return;
			viewport = result;
			mapState = 'ready';
			recordVisibleExposures();
			renderViewport();
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') return;
			if (sequence === viewportSequence) mapState = 'error';
		}
	}

	function updateMapContents() {
		refreshNearby();
		void loadViewport();
	}

	function moveToResult(result: GeocodingResult) {
		map?.fitBounds(
			[
				[result.bounds[0], result.bounds[1]],
				[result.bounds[2], result.bounds[3]]
			],
			{ maxZoom: 15, padding: [32, 32] }
		);
	}

	function showPlace(place: RecommendationPlace) {
		pendingOpenPlaceId = place.placeId;
		map?.flyTo([place.latitude, place.longitude], Math.max(map.getZoom(), 15));
		markers.get(place.placeId)?.openPopup();
	}

	async function searchLocation(event: SubmitEvent) {
		event.preventDefault();
		const query = locationQuery.trim();
		if (query.length < 2) return;
		searchState = 'loading';
		locationResults = [];
		try {
			const response = await fetch(localizeHref('/api/geocode', { locale }), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query })
			});
			if (!response.ok) throw new Error('Location search failed');
			const payload = (await response.json()) as { results?: GeocodingResult[] };
			locationResults = payload.results ?? [];
			searchState = locationResults.length ? 'idle' : 'empty';
			if (locationResults[0]) moveToResult(locationResults[0]);
		} catch {
			searchState = 'error';
		}
	}

	function setupMap(element: HTMLDivElement) {
		let disposed = false;
		void import('leaflet').then((module) => {
			if (disposed) return;
			leaflet = module;
			map = module.map(element, {
				center: [42.5, 12.5],
				zoom: 5,
				minZoom: 4,
				maxBounds: [
					[34, 3],
					[49, 21]
				],
				maxBoundsViscosity: 0.65,
				zoomControl: true,
				keyboard: true
			});
			module
				.tileLayer(tileUrl, {
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
					maxZoom: 19
				})
				.addTo(map);
			catalogueLayer = module.layerGroup().addTo(map);
			emphasisLayer = module.layerGroup().addTo(map);
			if (places.length > 0) {
				map.fitBounds(
					module.latLngBounds(places.map((place) => [place.latitude, place.longitude])),
					{ maxZoom: 12, padding: [24, 24] }
				);
			}
			const onMove = () => {
				if (moveTimer) clearTimeout(moveTimer);
				moveTimer = setTimeout(updateMapContents, 220);
			};
			map.on('moveend', onMove);
			updateMapContents();
		});
		return () => {
			disposed = true;
			if (moveTimer) clearTimeout(moveTimer);
			viewportController?.abort();
			map?.remove();
			markers.clear();
		};
	}
</script>

<div class="map-discovery">
	<form class="surface-card map-search" onsubmit={searchLocation}>
		<div class="field">
			<label for="map-location-search">{m.map_search_label()}</label>
			<input
				id="map-location-search"
				type="search"
				bind:value={locationQuery}
				placeholder={m.map_search_placeholder()}
				minlength="2"
				maxlength="160"
				autocomplete="street-address"
			/>
			<p class="field__hint">{m.map_search_help()}</p>
		</div>
		<button class="button" type="submit" disabled={searchState === 'loading'}>
			{searchState === 'loading' ? m.search_loading() : m.map_search_action()}
		</button>
	</form>

	{#if locationResults.length > 0}
		<div class="map-search-results" aria-labelledby="map-search-results-title">
			<strong id="map-search-results-title">{m.map_search_results()}</strong>
			<ul>
				{#each locationResults as result (result.id)}
					<li>
						<button type="button" onclick={() => moveToResult(result)}>{result.label}</button>
					</li>
				{/each}
			</ul>
			<small>{m.map_attribution_search()}</small>
		</div>
	{:else if searchState === 'empty'}
		<p class="form-status" role="status">{m.map_search_empty()}</p>
	{:else if searchState === 'error'}
		<p class="form-status form-status--error" role="alert">{m.map_search_error()}</p>
	{/if}

	<div class="map-legend surface-card" aria-label={m.map_legend()}>
		<strong>{m.map_legend()}</strong>
		<span><i class="legend-marker legend-marker--top">★</i>{m.map_top_nearby()}</span>
		<span><i class="legend-marker legend-marker--ranked">•</i>{m.map_ranked_restaurant()}</span>
		<span><i class="legend-marker legend-marker--unranked"></i>{m.map_unranked_restaurant()}</span>
		<span><i class="legend-marker legend-marker--visited">✓</i>{m.visited()}</span>
	</div>

	<div class="map-stage">
		<div class="restaurant-map" aria-label={m.map_accessible_label()} {@attach setupMap}></div>
		{#if mapState === 'loading'}
			<p class="map-loading" role="status">{m.map_restaurants_loading()}</p>
		{:else if mapState === 'error'}
			<p class="map-loading map-loading--error" role="alert">{m.map_restaurants_error()}</p>
		{/if}
	</div>

	<details class="surface-card nearby-recommendations" open>
		<summary>
			<span>{m.map_nearby_list()}</span>
			<small>{m.map_nearby_count({ count: nearby.length })}</small>
		</summary>
		<p class="field__hint">{m.map_supported_scope_help()}</p>
		{#if nearby.length === 0}
			<p>{m.map_nearby_empty()}</p>
		{:else}
			<ol>
				{#each nearby as place, index (place.placeId)}
					<li class:nearby-recommendation--top={index < topCount}>
						<button
							type="button"
							onclick={() => showPlace(place)}
							aria-label={m.map_show_restaurant({ name: place.name })}
						>
							<span class="nearby-recommendation__rank">{index + 1}</span>
							<span>
								<strong>{place.name}</strong>
								<small
									>{placeAddress(place)} · {place.visited ? m.visited() : m.not_visited()}</small
								>
							</span>
							{#if index < topCount}<span class="nearby-recommendation__badge"
									>{m.map_top_nearby()}</span
								>{/if}
						</button>
					</li>
				{/each}
			</ol>
		{/if}
	</details>
</div>
