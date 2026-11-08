// Builds the claude.ai artifact version: one IIFE bundle (React loaded from cdnjs as
// globals), with the server API swapped for the artifact db/user runtime.
// Run `npm run build:artifact`, then `node scripts/assemble-artifact.mjs`.
import { defineConfig } from 'vite';
import path from 'node:path';

const swaps = {
  [path.resolve(__dirname, 'src/api.js')]: path.resolve(__dirname, 'artifact/api.js'),
  [path.resolve(__dirname, 'src/pages/Login.jsx')]: path.resolve(__dirname, 'artifact/SignedOut.jsx'),
};

export default defineConfig({
  mode: 'artifact',
  plugins: [
    {
      name: 'artifact-swaps',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        const r = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (r && swaps[r.id]) return swaps[r.id];
        return null;
      },
    },
  ],
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    jsxInject: "import React from 'react'",
  },
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, 'artifact/main.jsx'),
      name: 'StudyTracker',
      formats: ['iife'],
      fileName: () => 'app.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
        assetFileNames: 'app.[ext]',
      },
    },
  },
  define: { 'process.env.NODE_ENV': '"production"' },
});
