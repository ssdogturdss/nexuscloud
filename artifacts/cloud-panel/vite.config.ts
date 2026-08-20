import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// PORT defaults to 5173 (standard Vite default) so the panel runs outside
// Replit without needing extra env var setup.
const port = Number(process.env.PORT ?? '5173');
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

// BASE_PATH defaults to "/" — override when serving from a sub-path.
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Proxy /api requests to the API server so both artifacts share a single
    // origin in development (avoids cross-origin cookie/CORS issues).
    // API_SERVER_PORT defaults to 8080 — the port assigned to the api-server artifact.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_SERVER_PORT ?? '8080'}`,
        changeOrigin: false,
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
