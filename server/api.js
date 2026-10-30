import { createHub } from './hub.js'

const MAX_BODY = 64 * 1024

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > MAX_BODY) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

export function createApi() {
  const hub = createHub()
  return (req, res, next) => {
    const { pathname } = new URL(req.url, 'http://localhost')
    if (pathname === '/api/events') return hub.attach(req, res)
    if (pathname === '/api/selection' && req.method === 'POST') {
      readJson(req)
        .then(({ client, hidden }) => {
          hub.select(client, hidden)
          res.writeHead(204).end()
        })
        .catch(() => res.writeHead(400).end())
      return
    }
    next()
  }
}
