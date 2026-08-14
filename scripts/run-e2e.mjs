import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const address = 'http://127.0.0.1:3000';
const playwrightCli = fileURLToPath(
	new URL('../node_modules/@playwright/test/cli.js', import.meta.url)
);

function waitForExit(child) {
	if (child.exitCode !== null) return Promise.resolve(child.exitCode);
	return new Promise((resolve) => child.once('exit', resolve));
}

async function terminateChildTree(child) {
	if (child.exitCode !== null) return;

	if (process.platform === 'win32') {
		const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
			stdio: 'ignore'
		});
		await waitForExit(taskkill);
		return;
	}

	child.kill('SIGTERM');
	const stopped = await Promise.race([
		waitForExit(child).then(() => true),
		new Promise((resolve) => setTimeout(() => resolve(false), 5_000))
	]);

	if (!stopped && child.exitCode === null) child.kill('SIGKILL');
}

async function waitForServer(server) {
	const deadline = Date.now() + 30_000;

	while (Date.now() < deadline) {
		if (server.exitCode !== null) {
			throw new Error(`The test server exited before becoming ready (code ${server.exitCode})`);
		}

		try {
			const response = await fetch(`${address}/en`);
			if (response.ok) return;
		} catch {
			// The server is still starting.
		}

		await new Promise((resolve) => setTimeout(resolve, 200));
	}

	throw new Error('The test server did not become ready within 30 seconds');
}

async function stopServer(server) {
	if (server.exitCode !== null) return;

	server.kill('SIGTERM');

	const stopped = await Promise.race([
		waitForExit(server).then(() => true),
		new Promise((resolve) => setTimeout(() => resolve(false), 5_000))
	]);

	if (!stopped && server.exitCode === null) {
		server.kill('SIGKILL');
		await waitForExit(server);
	}
}

const server = spawn(process.execPath, ['--env-file=.env.test', 'build'], {
	env: { ...process.env, HOST: '127.0.0.1', PORT: '3000' },
	stdio: 'inherit'
});

let exitCode;

try {
	await waitForServer(server);

	const tests = spawn(process.execPath, [playwrightCli, 'test'], {
		stdio: ['inherit', 'inherit', 'inherit', 'ipc']
	});

	const completed = new Promise((resolve) => {
		tests.on('message', (message) => {
			if (message?.type === 'playwright-tests-complete') resolve(message);
		});
	});

	const outcome = await Promise.race([
		waitForExit(tests).then((code) => ({ type: 'exit', code })),
		completed.then((result) => ({ type: 'complete', result }))
	]);

	if (outcome.type === 'exit') {
		exitCode = outcome.code ?? 1;
	} else {
		exitCode = outcome.result.status === 'passed' ? 0 : 1;

		const exitedNormally = await Promise.race([
			waitForExit(tests).then(() => true),
			new Promise((resolve) => setTimeout(() => resolve(false), 1_000))
		]);

		if (!exitedNormally) await terminateChildTree(tests);

		const label = outcome.result.total === 1 ? 'test' : 'tests';
		console.log(`\n${outcome.result.total} ${label} ${outcome.result.status}.`);
	}
} finally {
	await stopServer(server);
}

process.exitCode = exitCode;
