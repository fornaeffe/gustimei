import { describe, expect, it } from 'vitest';
import { compareMigrations } from './check-database-migrations.mjs';

describe('database migration parity', () => {
	it('accepts matching journal and database timestamps', () => {
		expect(
			compareMigrations(
				[{ when: 100 }, { when: 200 }],
				[{ created_at: '100' }, { created_at: '200' }]
			)
		).toEqual({ missing: [], unexpected: [] });
	});

	it('reports pending and unknown applied migrations', () => {
		expect(
			compareMigrations(
				[{ when: 100 }, { when: 200 }],
				[{ created_at: '100' }, { created_at: '300' }]
			)
		).toEqual({ missing: ['200'], unexpected: ['300'] });
	});
});
