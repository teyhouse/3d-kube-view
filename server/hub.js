import { randomUUID } from 'node:crypto'
import { config } from './config.js'
import { fetchTopology } from './topology.js'
import { startHubble } from './hubble.js'
import { startTetragon } from './tetragon.js'

const SYNC_DELAY_MS = 1000
const OVERLAP_MS = 2500
const REPLAY_FLOWS = 200

export function createHub() {
  const clients = new Map()
  const status = {}
  let topology = null
  let topologyJson = ''
  let running = null
  let idleTimer = null
  let syncTimer = null
  let stopStreams = null
  let streamKey = null
  const retiring = new Set()

  const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  const broadcast = (event, data) => clients.forEach((_, res) => send(res, event, data))

  const relevant = (hidden, ns) => ns !== undefined && !hidden.has(ns)

  const broadcastFiltered = (event, items, touches) => {
    for (const [res, client] of clients) {
      const visible = client.hidden.size ? items.filter(item => touches(item, client.hidden)) : items
      if (visible.length) send(res, event, visible)
    }
  }

  const setStatus = (source, state, message = '') => {
    const prev = status[source]
    if (prev?.state === state && prev?.message === message) return
    status[source] = { source, state, message }
    broadcast('status', status[source])
  }

  const desiredNamespaces = () => {
    const names = topology.namespaces.map(ns => ns.name)
    const wanted = names.filter(name => [...clients.values()].some(client => !client.hidden.has(name)))
    return wanted.length === names.length ? config.namespaces : wanted.length ? wanted : null
  }

  const startStreams = (namespaces, replay) => {
    const stopHubble = startHubble(namespaces, {
      replay,
      onFlows: flows => broadcastFiltered('flows', flows, (f, hidden) => relevant(hidden, f.src.ns) || relevant(hidden, f.dst.ns)),
      onStatus: (state, message) => setStatus('hubble', state, message)
    })
    const stopTetragon = startTetragon(namespaces, {
      onEvents: events => broadcastFiltered('process', events, (e, hidden) => relevant(hidden, e.ns)),
      onStatus: (state, message) => setStatus('tetragon', state, message)
    })
    return () => {
      stopHubble()
      stopTetragon()
    }
  }

  const applyStreams = () => {
    if (!running || !topology) return
    const namespaces = desiredNamespaces()
    const key = namespaces ? namespaces.join(',') : null
    if (key === streamKey && (stopStreams || !namespaces)) return
    const previous = stopStreams
    streamKey = key
    stopStreams = namespaces ? startStreams(namespaces, previous ? REPLAY_FLOWS : 0) : null
    if (!namespaces) {
      setStatus('hubble', 'pending', 'no namespaces selected')
      setStatus('tetragon', 'pending', 'no namespaces selected')
    }
    if (!previous) return
    retiring.add(previous)
    setTimeout(() => {
      if (retiring.delete(previous)) previous()
    }, OVERLAP_MS)
  }

  const syncStreams = () => {
    clearTimeout(syncTimer)
    syncTimer = setTimeout(applyStreams, SYNC_DELAY_MS)
  }

  const pollTopology = async () => {
    try {
      const next = await fetchTopology(config.namespaces)
      const json = JSON.stringify(next)
      setStatus('kubectl', 'ok', `${next.namespaces.length} namespaces`)
      if (json === topologyJson) return
      const first = !topology
      topologyJson = json
      topology = next
      broadcast('topology', topology)
      if (first) syncStreams()
    } catch (error) {
      setStatus('kubectl', 'error', error.message)
    }
  }

  const start = () => {
    pollTopology()
    syncStreams()
    const timer = setInterval(pollTopology, config.topologyIntervalMs)
    return () => {
      clearInterval(timer)
      clearTimeout(syncTimer)
      stopStreams?.()
      stopStreams = null
      streamKey = null
      retiring.forEach(stop => stop())
      retiring.clear()
    }
  }

  return {
    attach(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      })
      res.write('retry: 2000\n\n')
      const client = { id: randomUUID(), hidden: new Set() }
      clients.set(res, client)
      send(res, 'config', { client: client.id, namespaces: config.namespaces.length ? config.namespaces : 'all' })
      if (topology) send(res, 'topology', topology)
      Object.values(status).forEach(s => send(res, 'status', s))

      clearTimeout(idleTimer)
      running ??= start()
      syncStreams()

      const ping = setInterval(() => res.write(': ping\n\n'), 15000)
      req.on('close', () => {
        clearInterval(ping)
        clients.delete(res)
        if (clients.size) {
          syncStreams()
          return
        }
        idleTimer = setTimeout(() => {
          running?.()
          running = null
        }, config.idleShutdownMs)
      })
    },

    select(id, hidden) {
      const client = [...clients.values()].find(c => c.id === id)
      if (!client || !Array.isArray(hidden)) return
      client.hidden = new Set(hidden.filter(name => typeof name === 'string'))
      syncStreams()
    }
  }
}
