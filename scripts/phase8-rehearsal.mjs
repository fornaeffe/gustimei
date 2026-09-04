import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run the rehearsal through npm so npm_execpath is available');
const temporary = mkdtempSync(join(tmpdir(), 'gustimei-phase8-'));
const dumpPath = '/tmp/gustimei-phase8-rehearsal.dump';
const restoreDatabase = 'gustimei_phase8_restore';

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { stdio: 'inherit', ...options });
	if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

function runNpm(args, options) {
	run(process.execPath, [npmCli, ...args], options);
}

try {
	run('docker', ['compose', 'up', '-d', 'db-test']);
	runNpm(['run', 'ci']);
	runNpm(['run', 'test:db']);
	runNpm(['run', 'jobs:review-maintenance:test']);
	runNpm(['run', 'benchmark:phase1']);
	runNpm(['run', 'test:e2e'], { env: { ...process.env, E2E_PORT: '3108' } });

	// The target is a fixed, disposable database inside the checked-in local test container.
	run('docker', [
		'compose',
		'exec',
		'-T',
		'db-test',
		'pg_dump',
		'-U',
		'gustimei',
		'-d',
		'gustimei_test',
		'-Fc',
		'-f',
		dumpPath
	]);
	run('docker', [
		'compose',
		'exec',
		'-T',
		'db-test',
		'dropdb',
		'-U',
		'gustimei',
		'--if-exists',
		restoreDatabase
	]);
	run('docker', [
		'compose',
		'exec',
		'-T',
		'db-test',
		'createdb',
		'-U',
		'gustimei',
		restoreDatabase
	]);
	run('docker', [
		'compose',
		'exec',
		'-T',
		'db-test',
		'pg_restore',
		'-U',
		'gustimei',
		'-d',
		restoreDatabase,
		'--exit-on-error',
		dumpPath
	]);
	run('docker', [
		'compose',
		'exec',
		'-T',
		'db-test',
		'psql',
		'-U',
		'gustimei',
		'-d',
		restoreDatabase,
		'-v',
		'ON_ERROR_STOP=1',
		'-c',
		"select count(*) > 0 as restored from information_schema.tables where table_schema = 'public'"
	]);
	run('docker', ['compose', 'exec', '-T', 'db-test', 'dropdb', '-U', 'gustimei', restoreDatabase]);
	run('docker', ['build', '--target', 'app', '-t', 'gustimei:phase8-app', '.']);
	run('docker', ['build', '--target', 'ops', '-t', 'gustimei:phase8-ops', '.']);

	console.log(JSON.stringify({ status: 'passed', rehearsal: 'phase-8-local' }));
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
