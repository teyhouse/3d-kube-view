import { run } from './kubectl.js'

const KINDS = 'ingresses.networking.k8s.io,httproutes.gateway.networking.k8s.io'
const CACHE_MS = 60000
const GATEWAY_LABELS = ['gateway.envoyproxy.io/owning-gateway-name', 'gateway.networking.k8s.io/gateway-name', 'istio.io/gateway-name']
const TUNNEL = /cloudflared|tailscale|ngrok|frpc|inlets/

let cache = { at: 0, items: [] }

export async function fetchRoutes() {
  if (Date.now() - cache.at < CACHE_MS) return cache.items
  const items = await run(['get', KINDS, '-A', '-o', 'json'])
    .then(raw => JSON.parse(raw).items)
    .catch(() => [])
  cache = { at: Date.now(), items }
  return items
}

function ingressHosts(routes, workloadName) {
  return routes
    .filter(r => r.kind === 'Ingress')
    .filter(r => {
      const className = r.spec?.ingressClassName ?? r.metadata.annotations?.['kubernetes.io/ingress.class']
      return className && workloadName.includes(className)
    })
    .flatMap(r => (r.spec?.rules ?? []).map(rule => rule.host).filter(Boolean))
}

function gatewayHosts(routes, gateway) {
  return routes
    .filter(r => r.kind === 'HTTPRoute' && (r.spec?.parentRefs ?? []).some(ref => ref.name === gateway))
    .flatMap(r => r.spec?.hostnames ?? [])
}

export function findEntryPoints(namespaces, routes) {
  const entries = new Map()
  const add = (ns, pod, kind, hosts) => {
    const workload = pod.workload.split('/').slice(1).join('/')
    const id = `${ns.name}/${workload}`
    const entry = entries.get(id) ?? { id, ns: ns.name, workload, kind, pods: [], hosts: [] }
    if (!entry.pods.includes(pod.name)) entry.pods.push(pod.name)
    entry.hosts = [...new Set([...entry.hosts, ...hosts])].sort()
    entries.set(id, entry)
  }

  for (const ns of namespaces) {
    const pods = new Map(ns.pods.map(pod => [pod.name, pod]))
    for (const service of ns.services) {
      if (service.type !== 'LoadBalancer' && service.type !== 'NodePort') continue
      for (const name of service.backends) add(ns, pods.get(name), service.type, ingressHosts(routes, pods.get(name).workload))
    }
    for (const pod of ns.pods) {
      const gateway = GATEWAY_LABELS.map(label => pod.labels[label]).find(Boolean)
      if (gateway) add(ns, pod, 'Gateway', gatewayHosts(routes, gateway))
      else if (TUNNEL.test(pod.workload)) add(ns, pod, 'Tunnel', [])
    }
  }
  return [...entries.values()].sort((a, b) => a.id.localeCompare(b.id))
}
