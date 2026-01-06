import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
	{
		label: 'unit',
		files: [
			'out/test/*.test.js',
			'out/test/services/**/*.test.js',
		],
		mocha: {
			ui: 'tdd',
			timeout: 10000,
		},
	},
	{
		label: 'integration',
		files: 'out/test/integration/**/*.integration.test.js',
		mocha: {
			ui: 'tdd',
			timeout: 30000,
		},
		workspaceFolder: './test-fixtures/sample-repo',
	},
]);
