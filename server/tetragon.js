import { config } from './config.js'
import { listPods, supervise } from './kubectl.js'

const MAX_BATCH = 200

export function startTetragon(namespaces, { onEvents, onStatus }) {
  const stops = []
  let batch = []
  let stopped = false

  const ingest = line => {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    const type = Object.keys(msg).find(k => k.startsWith('process_'))
    const body = type && msg[type]
    const pod = body?.process?.pod
    if (!pod || batch.length >= MAX_BATCH) return
    batch.push({
      type: type.replace('process_', ''),
      ns: pod.namespace,
      pod: pod.name,
      container: pod.container?.name ?? null,
      binary: body.process.binary ?? '',
      args: body.process.arguments ?? '',
      fn: body.function_name ?? null,
      time: msg.time
    })
  }

  const timer = setInterval(() => {
    if (!batch.length) return
    onEvents(batch)
    batch = []
  }, config.batchIntervalMs)

  ;(async () => {
    try {
      const pods = await listPods('kube-system', 'app.kubernetes.io/name=tetragon')
      if (stopped) return
      if (!pods.length) return onStatus('error', 'no tetragon pods found')
      onStatus('pending', `connecting to ${pods.length} agent(s)`)
      const filters = namespaces.flatMap(ns => ['--namespace', ns])
      for (const pod of pods) {
        stops.push(
          supervise(['exec', '-n', 'kube-system', pod, '-c', 'tetragon', '--', 'tetra', 'getevents', '-o', 'json', ...filters], {
            onLine: ingest,
            onStart: () => onStatus('ok', `${pods.length} agent(s)`),
            onError: message => onStatus('error', message)
          })
        )
      }
      onStatus('ok', `${pods.length} agent(s), waiting for events`)
    } catch (error) {
      onStatus('error', error.message)
    }
  })()

  return () => {
    stopped = true
    clearInterval(timer)
    stops.forEach(stop => stop())
  }
}
