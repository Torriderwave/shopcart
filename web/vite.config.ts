import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// El proxy mantiene el mismo origen: la cookie httpOnly del refresh token viaja sin CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
});
