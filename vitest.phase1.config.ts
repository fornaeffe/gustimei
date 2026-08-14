import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['benchmarks/**/*.benchmark.ts'],
		expect: { requireAssertions: true },
		disableConsoleIntercept: true,
		testTimeout: 120_000
	}
});
