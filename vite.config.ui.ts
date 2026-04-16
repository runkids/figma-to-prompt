import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));

// Append "-dev" suffix when building locally (CI builds produce clean versions)
const version = process.env.CI ? pkg.version : `${pkg.version}-dev`;

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/ui'),
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  // `react`/`react-dom` aliases let any future React-ecosystem dep resolve to
  // Preact's compat layer without code changes. Preact itself uses `preact/jsx-runtime`
  // (configured via tsconfig.ui.json + @preact/preset-vite).
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  plugins: [preact(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/ui/ui.html'),
    },
  },
});
