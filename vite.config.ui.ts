import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));

const isPages = process.env.BUILD_TARGET === 'pages';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/ui'),
  base: isPages ? '/figma-to-prompt/' : './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    tailwindcss(),
    // Single-file inlining only for local builds (Figma requires one HTML file).
    // GitHub Pages build skips this for better caching with separate assets.
    ...(!isPages ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
  ],
  build: {
    outDir: resolve(import.meta.dirname, isPages ? 'dist-pages' : 'dist'),
    emptyOutDir: isPages,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/ui/ui.html'),
    },
  },
});
