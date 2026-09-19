import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
const { revision } = JSON.parse(readFileSync(new URL('./data-version.json', import.meta.url), 'utf8'));
export default defineConfig({
  base: process.env.BASE_PATH || '/massat-carte-3d/',
  define: { __DATA_REVISION__: JSON.stringify(revision) },
  server: { host: '127.0.0.1', port: 3006, strictPort: true },
  preview: { host: '127.0.0.1', port: 3006, strictPort: true },
  build: { target: 'es2022', minify: true, cssMinify: true, sourcemap: false }
});
