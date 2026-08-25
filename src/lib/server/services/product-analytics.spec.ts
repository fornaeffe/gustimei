import { describe, expect, it, vi } from 'vitest';
import type { Database } from '$lib/server/db';
import { ProductAnalyticsService } from './product-analytics';

describe('product analytics failure isolation', () => {
	it('does not fail the product action when analytics persistence is unavailable', async () => {
		const database = {
			insert: () => ({
				values: async () => {
					throw new Error('analytics schema is unavailable');
				}
			})
		} as unknown as Database;
		const reportFailure = vi.fn();
		const analytics = new ProductAnalyticsService(
			database,
			() => new Date('2026-08-25T09:00:00.000Z'),
			() => 'event-1',
			reportFailure
		);

		await expect(
			analytics.record({
				userId: 'user-1',
				cohortAssignmentId: 'assignment-1',
				name: 'comparison-submitted',
				category: 'restaurant',
				metadata: { outcome: 'left', answeredCount: 1 }
			})
		).resolves.toBe(false);
		expect(reportFailure).toHaveBeenCalledOnce();
	});
});
