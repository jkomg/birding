import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5003,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5004',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist'
  }
})
