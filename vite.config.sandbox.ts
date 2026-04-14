import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2017',
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/sandbox/main.ts'),
      name: 'FigmaToJson',
      formats: ['iife'],
      fileName: () => 'code.js',
    },
  },
});
