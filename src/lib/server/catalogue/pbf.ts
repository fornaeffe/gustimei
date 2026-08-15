import { createReadStream } from 'node:fs';
import createParser from 'osm-pbf-parser';
import type { OsmElementType } from '$lib/domain/catalogue/contracts';

export interface OsmInfo {
	version?: number;
	timestamp?: number;
}

interface OsmEntityBase {
	type: OsmElementType;
	id: number;
	tags: Record<string, string>;
	info?: OsmInfo;
}

export interface OsmNode extends OsmEntityBase {
	type: 'node';
	lat: number;
	lon: number;
}

export interface OsmWay extends OsmEntityBase {
	type: 'way';
	refs: number[];
}

export interface OsmRelationMember {
	type: OsmElementType;
	id: number;
	role: string;
}

export interface OsmRelation extends OsmEntityBase {
	type: 'relation';
	members: OsmRelationMember[];
}

export type OsmEntity = OsmNode | OsmWay | OsmRelation;

export interface OsmSourceReader {
	scan(visitor: (entity: OsmEntity) => void): Promise<void>;
}

export class PbfSourceReader implements OsmSourceReader {
	constructor(private readonly path: string) {}

	async scan(visitor: (entity: OsmEntity) => void) {
		await new Promise<void>((resolve, reject) => {
			const input = createReadStream(this.path);
			const parser = createParser();
			input.on('error', reject);
			parser.on('error', reject);
			parser.on('data', (entities: OsmEntity[]) => {
				for (const entity of entities) visitor(entity);
			});
			parser.on('end', resolve);
			input.pipe(parser);
		});
	}
}
