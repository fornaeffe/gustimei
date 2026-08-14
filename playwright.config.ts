import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	reporter: [['list'], ['./scripts/playwright-completion-reporter.mjs']],
	use: { baseURL: 'http://127.0.0.1:3000' },
	testMatch: '**/*.e2e.{ts,js}'
});
