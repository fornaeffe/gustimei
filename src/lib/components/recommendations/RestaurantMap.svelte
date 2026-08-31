<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import type { CircleMarker, Map as LeafletMap } from 'leaflet';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { nearbyRecommendationOrder, topNearbyCount } from '$lib/domain/recommendations/map';
	import * as m from '$lib/paraglide/messages';

	interface RestaurantMapPlace {
		placeId: string;
		name: string;
		displayLocality: string;
		addressLabel?: string;
		latitude: number;
		longitude: number;
		visited: boolean;
		predictedPosition: number;
	}

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
	}: { places: RestaurantMapPlace[]; tileUrl: string; artifactId: string } = $props();
	let map: LeafletMap | undefined;
	let nearby = $state<RestaurantMapPlace[]>([]);
	let locationQuery = $state('');
	let locationResults = $state<GeocodingResult[]>([]);
	let searchState = $state<'idle' | 'loading' | 'empty' | 'error'>('idle');
	let mapReady = $state(false);
	let topCount = $derived(topNearbyCount(nearby.length));
	const markers = new SvelteMap<string, CircleMarker>();
	const reportedExposures = new SvelteSet<string>();
	let moveTimer: ReturnType<typeof setTimeout> | undefined;
	let locale = $derived(getLocale());

	function placeAddress(place: RestaurantMapPlace) {
		return place.addressLabel || place.displayLocality;
	}

	function placeHref(placeId: string) {
		return localizeHref(`/places/${encodeURIComponent(placeId)}`, { locale });
	}

	function popupContent(place: RestaurantMapPlace, nearbyPosition: number, isTop: boolean) {
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
		state.textContent = place.visited ? m.visited() : m.not_visited();
		content.append(state);
		if (isTop) {
			const rank = document.createElement('strong');
			rank.className = 'map-popup__rank';
			rank.textContent = `${m.map_top_nearby()} · ${m.map_nearby_rank({ position: nearbyPosition })}`;
			content.append(rank);
		}
		return content;
	}

	function refreshNearby() {
		if (!map) return;
		const bounds = map.getBounds();
		nearby = nearbyRecommendationOrder(places, {
			south: bounds.getSouth(),
			west: bounds.getWest(),
			north: bounds.getNorth(),
			east: bounds.getEast()
		});
		const newlyExposed = nearby.filter(
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
		const nearbyPositions = new SvelteMap(nearby.map((place, index) => [place.placeId, index + 1]));
		for (const place of places) {
			const marker = markers.get(place.placeId);
			if (!marker) continue;
			const position = nearbyPositions.get(place.placeId);
			const isTop = position !== undefined && position <= topNearbyCount(nearby.length);
			marker.setStyle({
				color: place.visited ? '#52615a' : isTop ? '#a65008' : '#176b55',
				fillColor: place.visited ? '#9aa69f' : isTop ? '#efad61' : '#80cfaa',
				fillOpacity: 0.9,
				weight: isTop ? 3 : 2
			});
			marker.setRadius(isTop ? 9 : 7);
			marker.unbindTooltip();
			marker.bindTooltip(popupContent(place, position ?? 0, isTop), { direction: 'top' });
			marker.unbindPopup();
			marker.bindPopup(popupContent(place, position ?? 0, isTop), { minWidth: 210 });
		}
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

	function showPlace(place: RestaurantMapPlace) {
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
		void import('leaflet').then((leaflet) => {
			if (disposed) return;
			map = leaflet.map(element, {
				center: [42.5, 12.5],
				zoom: 5,
				zoomControl: true,
				keyboard: true
			});
			leaflet
				.tileLayer(tileUrl, {
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
					maxZoom: 19
				})
				.addTo(map);
			for (const place of places) {
				const marker = leaflet
					.circleMarker([place.latitude, place.longitude], {
						radius: 7,
						color: '#176b55',
						fillColor: '#80cfaa',
						fillOpacity: 0.9,
						weight: 2
					})
					.addTo(map);
				markers.set(place.placeId, marker);
			}
			if (places.length > 0) {
				map.fitBounds(
					leaflet.latLngBounds(places.map((place) => [place.latitude, place.longitude])),
					{ maxZoom: 12, padding: [24, 24] }
				);
			}
			const onMove = () => {
				if (moveTimer) clearTimeout(moveTimer);
				moveTimer = setTimeout(refreshNearby, 120);
			};
			map.on('moveend zoomend', onMove);
			mapReady = true;
			refreshNearby();
		});
		return () => {
			disposed = true;
			if (moveTimer) clearTimeout(moveTimer);
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

	<div class="map-stage">
		<div
			class="restaurant-map"
			class:restaurant-map--loading={!mapReady}
			aria-label={m.map_accessible_label()}
			{@attach setupMap}
		></div>
		{#if !mapReady}<p class="map-loading" role="status">{m.map_loading()}</p>{/if}
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
