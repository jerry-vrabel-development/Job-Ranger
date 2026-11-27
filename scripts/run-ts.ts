// Runs a TypeScript script that imports the app's own code (`#lib/...`, the
// JSON price table) through Vite's module runner, so the evals use exactly
// what the app uses. Usage: node scripts/run-ts.ts scripts/eval-score.ts [args]
import { runnerImport } from 'vite';

interface Script {
	main(args: string[]): Promise<number>;
}

const [, , file, ...args] = process.argv;
if (file === undefined) {
	console.error('Usage: node scripts/run-ts.ts <script.ts> [args]');
	process.exit(2);
}
const { module } = await runnerImport<Script>(`./${file}`, {
	configFile: false,
	logLevel: 'error'
});
process.exitCode = await module.main(args);
