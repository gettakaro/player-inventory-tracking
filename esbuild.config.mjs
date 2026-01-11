import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const isDev = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/frontend/index.ts'],
  bundle: true,
  outfile: 'public/dist/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: isDev,
  minify: !isDev,
  external: ['leaflet'], // Leaflet is loaded via CDN
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
};

if (isDev) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(config);
  console.log('Frontend built successfully!');
}
