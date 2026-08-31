export interface GeocodingResult {
	id: string;
	label: string;
	latitude: number;
	longitude: number;
	bounds: [south: number, west: number, north: number, east: number];
}

interface NominatimResult {
	place_id?: number;
	display_name?: string;
	lat?: string;
	lon?: string;
	boundingbox?: [string, string, string, string];
}

interface CacheEntry {
	expiresAt: number;
	results: GeocodingResult[];
}

const MINIMUM_REQUEST_INTERVAL_MS = 1_100;
const CACHE_TTL_MS = 24 * 60 * 60_000;
const MAXIMUM_CACHE_ENTRIES = 1_000;

const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));

function parseResult(result: NominatimResult): GeocodingResult | undefined {
	const latitude = Number(result.lat);
	const longitude = Number(result.lon);
	const box = result.boundingbox?.map(Number);
	if (
		!result.display_name ||
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude) ||
		!box ||
		box.length !== 4 ||
		box.some((coordinate) => !Number.isFinite(coordinate))
	)
		return undefined;
	return {
		id: String(result.place_id ?? `${latitude}:${longitude}`),
		label: result.display_name,
		latitude,
		longitude,
		bounds: [box[0], box[2], box[1], box[3]]
	};
}

export class NominatimGeocoder {
	readonly #cache = new Map<string, CacheEntry>();
	#lastRequestAt = 0;
	#queue: Promise<void> = Promise.resolve();

	constructor(
		private readonly baseUrl: string,
		private readonly applicationOrigin: string,
		private readonly fetcher: typeof fetch = fetch,
		private readonly clock: () => number = Date.now,
		private readonly sleeper: (duration: number) => Promise<void> = wait
	) {}

	async search(query: string, locale: 'en' | 'it'): Promise<GeocodingResult[]> {
		const normalized = query.trim().replace(/\s+/g, ' ');
		if (normalized.length < 2 || normalized.length > 160) {
			throw new Error('Location searches must contain between 2 and 160 characters');
		}
		const cacheKey = `${locale}:${normalized.toLocaleLowerCase(locale)}`;
		const cached = this.#cache.get(cacheKey);
		if (cached && cached.expiresAt > this.clock()) return cached.results;

		let release!: () => void;
		const turn = new Promise<void>((resolve) => (release = resolve));
		const previous = this.#queue;
		this.#queue = turn;
		await previous;
		try {
			const delay = Math.max(0, MINIMUM_REQUEST_INTERVAL_MS - (this.clock() - this.#lastRequestAt));
			if (delay) await this.sleeper(delay);
			const url = new URL(`${this.baseUrl}/search`);
			url.searchParams.set('q', normalized);
			url.searchParams.set('format', 'jsonv2');
			url.searchParams.set('limit', '5');
			url.searchParams.set('countrycodes', 'it');
			url.searchParams.set('accept-language', locale);
			this.#lastRequestAt = this.clock();
			const response = await this.fetcher(url, {
				headers: {
					Accept: 'application/json',
					'User-Agent': `GustiMei/0.0.1 (+${this.applicationOrigin})`
				},
				signal: AbortSignal.timeout(8_000)
			});
			if (!response.ok) throw new Error(`Geocoding provider returned ${response.status}`);
			const body = (await response.json()) as unknown;
			if (!Array.isArray(body)) throw new Error('Geocoding provider returned an invalid response');
			const results = body
				.map((item) => parseResult(item as NominatimResult))
				.filter((item): item is GeocodingResult => Boolean(item));
			this.#cache.set(cacheKey, { expiresAt: this.clock() + CACHE_TTL_MS, results });
			if (this.#cache.size > MAXIMUM_CACHE_ENTRIES) {
				const oldestKey = this.#cache.keys().next().value;
				if (oldestKey) this.#cache.delete(oldestKey);
			}
			return results;
		} finally {
			release();
		}
	}
}
