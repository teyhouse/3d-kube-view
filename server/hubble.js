import { config } from './config.js'
import { execStream, listPods, supervise } from './kubectl.js'

const MAX_BATCH = 400

export function startHubble(namespaces, { onFlows, onStatus, replay = 0 }) {
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
    if (!flow?.IP || flow.Type === 'SOCK') return
    const summary = summarize(flow)
    const key = `${summary.srcId}|${summary.dstId}|${summary.proto}|${summary.port}|${summary.verdict}|${summary.reply}|${summary.label}|${summary.code}|${summary.dropReason}`
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
      if (replay) filters.push('--last', String(replay))
      for (const pod of pods) {
        stops.push(
          supervise(execStream(pod, 'cilium-agent', ['hubble', 'observe', '--follow', '-o', 'json', ...filters]), {
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
  const detail = l7Detail(flow.l7)
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
    ...detail,
    dropReason: flow.verdict === 'DROPPED' ? flow.drop_reason_desc ?? null : null
  }
}

function l7Detail(l7) {
  if (!l7) return { label: null, code: null, l7Type: null, latencyMs: null }
  const latencyMs = l7.latency_ns ? Number(l7.latency_ns) / 1e6 : null
  const l7Type = l7.type ?? null
  if (l7.dns) return { label: (l7.dns.query ?? '').replace(/\.$/, ''), code: l7.dns.rcode ?? null, l7Type, latencyMs }
  if (l7.http) return { label: `${l7.http.method ?? ''} ${pathOf(l7.http.url)}`.trim(), code: l7.http.code ?? null, l7Type, latencyMs }
  return { label: null, code: null, l7Type, latencyMs }
}

function pathOf(url = '') {
  try {
    return new URL(url).pathname
  } catch {
    return url.split('?')[0]
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
