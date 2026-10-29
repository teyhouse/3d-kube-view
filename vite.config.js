import { defineConfig } from 'vite'
import { createApi } from './server/api.js'

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173 },
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    {
      name: 'kube-api',
      configureServer(server) {
        server.middlewares.use(createApi())
      }
    }
  ]
})
