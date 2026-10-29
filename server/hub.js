import { config } from './config.js'
import { fetchTopology } from './topology.js'
import { startHubble } from './hubble.js'
import { startTetragon } from './tetragon.js'

export function createHub() {
  const clients = new Set()
  const status = {}
  let topology = null
  let topologyJson = ''
  let running = null
  let idleTimer = null

  const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  const broadcast = (event, data) => clients.forEach(res => send(res, event, data))

  const setStatus = (source, state, message = '') => {
    const prev = status[source]
    if (prev?.state === state && prev?.message === message) return
    status[source] = { source, state, message }
    broadcast('status', status[source])
  }

  const pollTopology = async () => {
    try {
      const next = await fetchTopology(config.namespaces)
      const json = JSON.stringify(next)
      setStatus('kubectl', 'ok', `${next.namespaces.length} namespaces`)
      if (json === topologyJson) return
      topologyJson = json
      topology = next
      broadcast('topology', topology)
    } catch (error) {
      setStatus('kubectl', 'error', error.message)
    }
  }

  const start = () => {
    pollTopology()
    const timer = setInterval(pollTopology, config.topologyIntervalMs)
    const stopHubble = startHubble(config.namespaces, {
      onFlows: flows => broadcast('flows', flows),
      onStatus: (state, message) => setStatus('hubble', state, message)
    })
    const stopTetragon = startTetragon(config.namespaces, {
      onEvents: events => broadcast('process', events),
      onStatus: (state, message) => setStatus('tetragon', state, message)
    })
    return () => {
      clearInterval(timer)
      stopHubble()
      stopTetragon()
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
      clients.add(res)
      send(res, 'config', { namespaces: config.namespaces.length ? config.namespaces : 'all' })
      if (topology) send(res, 'topology', topology)
      Object.values(status).forEach(s => send(res, 'status', s))

      clearTimeout(idleTimer)
      running ??= start()

      const ping = setInterval(() => res.write(': ping\n\n'), 15000)
      req.on('close', () => {
        clearInterval(ping)
        clients.delete(res)
        if (clients.size) return
        idleTimer = setTimeout(() => {
          running?.()
          running = null
        }, config.idleShutdownMs)
      })
    }
  }
}
