import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const longProxyTimeout = 30 * 60 * 1000

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: longProxyTimeout,
        proxyTimeout: longProxyTimeout
      },
      '/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: longProxyTimeout,
        proxyTimeout: longProxyTimeout
      },
      '/resource': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: longProxyTimeout,
        proxyTimeout: longProxyTimeout
      }
    }
  }
})
