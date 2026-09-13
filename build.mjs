import { build, context } from 'esbuild';
import { rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: './dist/extension.js',
  external: ['vscode', 'bufferutil', 'utf-8-validate'],
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  sourcesContent: false,
  logLevel: 'info',
};

rmSync('./dist', { recursive: true, force: true });

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[VSC Execute] watching for changes...');
} else {
  await build(options);
}