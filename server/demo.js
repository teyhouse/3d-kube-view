import { randomUUID } from 'node:crypto'

const TICK_MS = 250
const PROCESS_MS = 2500
const ROLLOUT_MS = 40000
const NODES = ['node-a', 'node-b', 'node-c']

const RESTRICTED = { ingress: 'restricted', egress: 'restricted' }
const INGRESS_ONLY = { ingress: 'restricted', egress: 'open' }
const EGRESS_ONLY = { ingress: 'open', egress: 'restricted' }

const LAYOUT = [
  {
    name: 'shop',
    district: 'applications',
    workloads: [
      { name: 'frontend', replicas: 3, policy: RESTRICTED, service: { port: 80, target: 8080 } },
      { name: 'catalog', replicas: 2, policy: RESTRICTED, service: { port: 9000, target: 9000 } },
      { name: 'cart', replicas: 2, policy: RESTRICTED, service: { port: 9000, target: 9000 } }
    ]
  },
  {
    name: 'payments',
    district: 'applications',
    workloads: [{ name: 'checkout', replicas: 2, policy: RESTRICTED, containers: 2, service: { port: 8443, target: 8443 } }]
  },
  {
    name: 'marketing',
    district: 'applications',
    workloads: [{ name: 'newsletter', replicas: 1, policy: EGRESS_ONLY }]
  },
  {
    name: 'data',
    district: 'infrastructure',
    workloads: [
      { name: 'postgres', replicas: 2, kind: 'StatefulSet', policy: RESTRICTED, service: { port: 5432, target: 5432 } },
      { name: 'redis', replicas: 1, policy: INGRESS_ONLY, service: { port: 6379, target: 6379 } }
    ]
  },
  {
    name: 'ingress-nginx',
    district: 'infrastructure',
    workloads: [{ name: 'controller', replicas: 2, policy: INGRESS_ONLY, service: { port: 443, target: 8443, type: 'LoadBalancer' } }]
  },
  {
    name: 'monitoring',
    district: 'infrastructure',
    workloads: [{ name: 'prometheus', replicas: 1, policy: EGRESS_ONLY, service: { port: 9090, target: 9090 } }]
  },
  {
    name: 'kube-system',
    district: 'system',
    workloads: [
      { name: 'coredns', replicas: 2, service: { port: 53, target: 53 } },
      { name: 'metrics-server', replicas: 1 }
    ]
  }
]

const POLICIES = {
  shop: ['shop-default-deny', 'frontend-from-ingress'],
  payments: ['checkout-locked-down'],
  data: ['data-from-apps-only'],
  'ingress-nginx': ['allow-from-world'],
  marketing: ['newsletter-egress'],
  monitoring: ['scrape-everything']
}

const FLOWS = [
  { from: 'world', to: 'ingress-nginx/controller', port: 8443, rate: 0.9, l7: 'http', label: 'GET /' },
  { from: 'ingress-nginx/controller', to: 'shop/frontend', port: 8080, rate: 0.9, l7: 'http', label: 'GET /products', latencyMs: 18 },
  { from: 'shop/frontend', to: 'shop/catalog', port: 9000, rate: 0.7 },
  { from: 'shop/frontend', to: 'shop/cart', port: 9000, rate: 0.4 },
  { from: 'shop/frontend', to: 'payments/checkout', port: 8443, rate: 0.15, l7: 'http', label: 'POST /checkout', latencyMs: 96 },
  { from: 'shop/catalog', to: 'data/postgres', port: 5432, rate: 0.6 },
  { from: 'shop/cart', to: 'data/redis', port: 6379, rate: 0.4 },
  { from: 'payments/checkout', to: 'data/postgres', port: 5432, rate: 0.15 },
  { from: 'payments/checkout', to: 'world', port: 443, rate: 0.12 },
  { from: 'monitoring/prometheus', to: 'shop/frontend', port: 8080, rate: 0.1 },
  { from: 'monitoring/prometheus', to: 'data/postgres', port: 5432, rate: 0.08 },
  { from: 'shop/frontend', to: 'kube-system/coredns', port: 53, rate: 0.2, proto: 'UDP', l7: 'dns', label: 'catalog.shop.svc.cluster.local' },
  { from: 'payments/checkout', to: 'kube-system/coredns', port: 53, rate: 0.1, proto: 'UDP', l7: 'dns', label: 'api.payment-provider.example' },
  { from: 'marketing/newsletter', to: 'kube-system/coredns', port: 53, rate: 0.03, proto: 'UDP', l7: 'dns', label: 'tracker.invalid', code: 3 },
  { from: 'marketing/newsletter', to: 'world', port: 443, rate: 0.05 },
  { from: 'host', to: 'shop/frontend', port: 8080, rate: 0.12 },
  { from: 'host', to: 'data/redis', port: 6379, rate: 0.06 },
  { from: 'ingress-nginx/controller', to: 'shop/frontend', port: 8080, rate: 0.03, l7: 'http', label: 'GET /checkout', code: 500, latencyMs: 412 },
  { from: 'marketing/newsletter', to: 'data/postgres', port: 5432, rate: 0.08, verdict: 'DROPPED', dropReason: 'Policy denied' },
  { from: 'world', to: 'data/postgres', port: 5432, rate: 0.02, verdict: 'DROPPED', dropReason: 'Policy denied' }
]

const PROCESSES = [
  { workload: 'data/postgres', binary: '/usr/bin/pg_isready', type: 'exec' },
  { workload: 'shop/frontend', binary: '/usr/bin/curl', type: 'exec' },
  { workload: 'monitoring/prometheus', binary: '/bin/promtool', type: 'exec' },
  { workload: 'kube-system/metrics-server', binary: '/bin/sh', type: 'exec', severity: 'warn' },
  { workload: 'marketing/newsletter', binary: '/bin/cat', type: 'kprobe', fn: 'security_file_permission', policy: 'detect-sensitive-file-read', target: '/etc/shadow', severity: 'high', rate: 0.15 }
]

const suffix = () => Math.random().toString(36).slice(2, 7)

function endpointId(e) {
  return e.kind === 'pod' ? `pod:${e.ns}/${e.name}` : e.kind
}

export function createDemoHub() {
  const clients = new Map()
  const pods = new Map()
  let nodeIndex = 0
  let ipIndex = 10
  let timers = []

  const newPod = (ns, workload) => ({
    name: `${workload.name}-${suffix()}`,
    ip: `10.42.0.${ipIndex++ % 250}`,
    node: NODES[nodeIndex++ % NODES.length],
    phase: 'Running',
    ready: true,
    restarts: 0,
    containers: Array.from({ length: workload.containers ?? 1 }, (_, i) => `container-${i}`),
    ports: {},
    labels: { app: workload.name },
    workload: `${workload.kind ?? 'Deployment'}/${workload.name}`,
    policy: {
      ingress: workload.policy?.ingress ?? 'none',
      egress: workload.policy?.egress ?? 'none',
      names: workload.policy ? POLICIES[ns.name] ?? [] : []
    }
  })

  for (const ns of LAYOUT) {
    for (const workload of ns.workloads) {
      pods.set(`${ns.name}/${workload.name}`, Array.from({ length: workload.replicas }, () => newPod(ns, workload)))
    }
  }

  const topology = () => {
    const namespaces = LAYOUT.map(ns => ({
      name: ns.name,
      district: ns.district,
      policies: (POLICIES[ns.name] ?? []).map(name => ({ name, kind: 'CiliumNetworkPolicy', ingress: 'restricted', egress: 'restricted' })),
      pods: ns.workloads.flatMap(w => pods.get(`${ns.name}/${w.name}`)),
      workloads: ns.workloads.map(w => {
        const owned = pods.get(`${ns.name}/${w.name}`)
        const kind = w.kind ?? 'Deployment'
        return { key: `${kind}/${w.name}`, kind, name: w.name, desired: owned.length, ready: owned.length }
      }),
      services: ns.workloads
        .filter(w => w.service)
        .map(w => ({
          name: w.name,
          type: w.service.type ?? 'ClusterIP',
          clusterIP: '10.43.0.1',
          ports: [`${w.service.port}/TCP`],
          targets: [w.service.target],
          backends: pods.get(`${ns.name}/${w.name}`).map(p => p.name)
        }))
    }))
    const entry = pods.get('ingress-nginx/controller')
    return {
      nodes: NODES.map(name => ({ name, ready: true, roles: name === 'node-a' ? ['control-plane'] : [], kubelet: 'demo', cpu: '8', memory: '32Gi' })),
      namespaces,
      entryPoints: [{ id: 'ingress-nginx/controller', ns: 'ingress-nginx', workload: 'controller', kind: 'LoadBalancer', pods: entry.map(p => p.name), hosts: ['shop.example.com'] }]
    }
  }

  const resolve = ref => {
    if (ref === 'world' || ref === 'host') return { kind: ref }
    const [ns, workload] = ref.split('/')
    const list = pods.get(ref)
    return { kind: 'pod', ns, name: list[Math.floor(Math.random() * list.length)].name, workload }
  }

  const clean = ({ kind, ns, name }) => (kind === 'pod' ? { kind, ns, name } : { kind })

  const flowFrom = (spec, reply) => {
    const client = clean(resolve(spec.from))
    const server = clean(resolve(spec.to))
    const [src, dst] = reply ? [server, client] : [client, server]
    return {
      src,
      dst,
      srcId: endpointId(src),
      dstId: endpointId(dst),
      proto: spec.proto ?? 'TCP',
      l7: spec.l7 ?? null,
      port: spec.port,
      verdict: spec.verdict ?? 'FORWARDED',
      reply,
      label: spec.label ?? null,
      code: reply ? spec.code ?? null : null,
      l7Type: spec.l7 ? (reply ? 'RESPONSE' : 'REQUEST') : null,
      latencyMs: reply ? spec.latencyMs ?? null : null,
      dropReason: spec.dropReason ?? null,
      count: 1 + Math.floor(Math.random() * 3)
    }
  }

  const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  const broadcast = (event, items, touches) => {
    for (const [res, client] of clients) {
      const visible = items.filter(item => touches(item, client.hidden))
      if (visible.length) send(res, event, visible)
    }
  }

  const relevant = (hidden, ns) => ns !== undefined && !hidden.has(ns)

  const emitFlows = () => {
    const flows = []
    for (const spec of FLOWS) {
      if (Math.random() > spec.rate) continue
      flows.push(flowFrom(spec, false))
      if (spec.verdict !== 'DROPPED' && Math.random() < 0.6) flows.push(flowFrom(spec, true))
    }
    broadcast('flows', flows, (f, hidden) => relevant(hidden, f.src.ns) || relevant(hidden, f.dst.ns))
  }

  const emitProcesses = () => {
    const events = PROCESSES.filter(p => Math.random() < (p.rate ?? 0.5)).map(p => {
      const pod = resolve(p.workload)
      return { type: p.type, ns: pod.ns, pod: pod.name, container: 'container-0', binary: p.binary, args: '', fn: p.fn ?? null, policy: p.policy ?? null, target: p.target ?? null, severity: p.severity ?? null, time: new Date().toISOString() }
    })
    broadcast('process', events, (e, hidden) => relevant(hidden, e.ns))
  }

  const rollout = () => {
    const ns = LAYOUT[0]
    const workload = ns.workloads[Math.floor(Math.random() * ns.workloads.length)]
    const list = pods.get(`${ns.name}/${workload.name}`)
    list[Math.floor(Math.random() * list.length)] = newPod(ns, workload)
    const other = pods.get('data/redis')[0]
    other.restarts++
    const next = topology()
    for (const res of clients.keys()) send(res, 'topology', next)
  }

  const start = () => {
    timers = [setInterval(emitFlows, TICK_MS), setInterval(emitProcesses, PROCESS_MS), setInterval(rollout, ROLLOUT_MS)]
  }

  const stop = () => {
    timers.forEach(clearInterval)
    timers = []
  }

  return {
    attach(req, res) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write('retry: 2000\n\n')
      const client = { id: randomUUID(), hidden: new Set() }
      clients.set(res, client)
      send(res, 'config', { client: client.id, namespaces: ['simulated demo cluster'] })
      send(res, 'topology', topology())
      for (const source of ['kubectl', 'hubble', 'tetragon']) send(res, 'status', { source, state: 'ok', message: 'demo data' })
      if (!timers.length) start()
      req.on('close', () => {
        clients.delete(res)
        if (!clients.size) stop()
      })
    },

    select(id, hidden) {
      const client = [...clients.values()].find(c => c.id === id)
      if (client && Array.isArray(hidden)) client.hidden = new Set(hidden.filter(name => typeof name === 'string'))
    }
  }
}
