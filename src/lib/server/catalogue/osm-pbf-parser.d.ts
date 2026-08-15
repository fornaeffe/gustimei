declare module 'osm-pbf-parser' {
	import type { Transform } from 'node:stream';
	function createParser(): Transform;
	export = createParser;
}
