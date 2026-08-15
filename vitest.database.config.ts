import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
	},
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		fileParallelism: false,
		include: ['src/**/*.integration.spec.ts'],
		sequence: { concurrent: false }
	}
});
