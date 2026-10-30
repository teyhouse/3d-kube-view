import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { createApi } from './api.js'

const dist = fileURLToPath(new URL('../dist', import.meta.url))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}

const api = createApi()

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0))

const serveStatic = async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  const file = normalize(join(dist, pathname === '/' ? 'index.html' : pathname))
  const target = file.startsWith(dist) ? file : join(dist, 'index.html')
  try {
    const body = await readFile(target)
    res.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    const body = await readFile(join(dist, 'index.html')).catch(() => null)
    if (!body) {
      res.writeHead(404).end('Run "npm run build" first.')
      return
    }
    res.writeHead(200, { 'Content-Type': types['.html'] }).end(body)
  }
}

http.createServer((req, res) => api(req, res, () => serveStatic(req, res))).listen(config.port, '127.0.0.1', () => {
  console.log(`3d-kube-view on http://127.0.0.1:${config.port} ${config.demo ? 'showing a simulated demo cluster' : `watching ${config.namespaces.join(', ') || 'all namespaces'}`}`)
})
