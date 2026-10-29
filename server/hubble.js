import { config } from './config.js'
import { listPods, supervise } from './kubectl.js'

const MAX_BATCH = 400

export function startHubble(namespaces, { onFlows, onStatus }) {
  const stops = []
  const batch = new Map()
  let stopped = false

  const ingest = line => {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    const flow = msg.flow
    if (!flow?.IP) return
    const summary = summarize(flow)
    const key = `${summary.srcId}|${summary.dstId}|${summary.proto}|${summary.port}|${summary.verdict}|${summary.reply}`
    const entry = batch.get(key)
    if (entry) entry.count++
    else if (batch.size < MAX_BATCH) batch.set(key, { ...summary, count: 1 })
  }

  const timer = setInterval(() => {
    if (!batch.size) return
    onFlows([...batch.values()])
    batch.clear()
  }, config.batchIntervalMs)

  ;(async () => {
    try {
      const pods = await listPods('kube-system', 'k8s-app=cilium')
      if (stopped) return
      if (!pods.length) return onStatus('error', 'no cilium agent pods found')
      onStatus('pending', `connecting to ${pods.length} agent(s)`)
      const filters = namespaces.length ? namespaces.flatMap(ns => ['--namespace', ns]) : ['--all-namespaces']
      for (const pod of pods) {
        stops.push(
          supervise(['exec', '-n', 'kube-system', pod, '-c', 'cilium-agent', '--', 'hubble', 'observe', '--follow', '-o', 'json', ...filters], {
            onLine: ingest,
            onStart: () => onStatus('ok', `${pods.length} agent(s)`),
            onError: message => onStatus('error', message)
          })
        )
      }
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

function summarize(flow) {
  const reply = flow.is_reply === true
  let src = endpoint(flow.source)
  let dst = endpoint(flow.destination)
  const l4 = flow.l4 ?? {}
  const proto = Object.keys(l4)[0] ?? 'other'
  const ports = l4[proto] ?? {}
  let port = ports.destination_port ?? null
  if (reply) {
    ;[src, dst] = [dst, src]
    port = ports.source_port ?? null
  }
  const l7 = flow.l7?.http ? 'http' : flow.l7?.dns ? 'dns' : null
  return {
    src,
    dst,
    srcId: endpointId(src),
    dstId: endpointId(dst),
    proto,
    l7,
    port,
    verdict: flow.verdict ?? 'UNKNOWN',
    reply,
    service: flow.destination_service?.name ?? null
  }
}

function endpoint(e = {}) {
  if (e.namespace && e.pod_name) return { kind: 'pod', ns: e.namespace, name: e.pod_name }
  if (e.namespace) return { kind: 'namespace', ns: e.namespace }
  const labels = e.labels ?? []
  if (labels.some(l => l.startsWith('reserved:world'))) return { kind: 'world' }
  if (labels.some(l => l.startsWith('reserved:'))) return { kind: 'host' }
  return { kind: 'world' }
}

function endpointId(e) {
  if (e.kind === 'pod') return `pod:${e.ns}/${e.name}`
  if (e.kind === 'namespace') return `ns:${e.ns}`
  return e.kind
}
