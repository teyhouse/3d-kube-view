import { createHub } from './hub.js'

export function createApi() {
  const hub = createHub()
  return (req, res, next) => {
    const { pathname } = new URL(req.url, 'http://localhost')
    if (pathname === '/api/events') return hub.attach(req, res)
    next()
  }
}
