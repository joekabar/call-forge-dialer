import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    // Proxy API calls to the backend during local development
    // so you never hit CORS issues
    proxy: {
      '/api': {
        target:       'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir:       'dist',
    sourcemap:    false,    // set to true if you want source maps in production
    chunkSizeWarningLimit: 600,
  },
})
