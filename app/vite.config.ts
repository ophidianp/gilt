import { defineConfig } from 'vite';

// Tauri expects a fixed dev port and its own console output.
// The /yf proxy only exists for `npm run dev` in a plain browser (see src/devmock.ts);
// the installed app fetches prices from Rust (src-tauri/src/lib.rs).
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      '/yf': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/yf/, ''),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) gilt' },
      },
    },
  },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
