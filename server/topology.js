import { listAll, run } from './kubectl.js'
import { fetchPolicies, policyForPod, policiesInNamespace } from './policies.js'
import { fetchRoutes, findEntryPoints } from './entrypoints.js'

const KINDS = 'pods,services,deployments,statefulsets,daemonsets,replicasets,jobs'
const CONTROLLERS = new Set(['Deployment', 'StatefulSet', 'DaemonSet'])
const FLUX_KINDS = ['kustomizations.kustomize.toolkit.fluxcd.io', 'helmreleases.helm.toolkit.fluxcd.io']
const KUSTOMIZATION_LABEL = 'kustomize.toolkit.fluxcd.io/name'
const FLUX_CACHE_MS = 60000

let fluxCache = { at: 0, items: [] }

async function fetchFlux() {
  if (Date.now() - fluxCache.at < FLUX_CACHE_MS) return fluxCache.items
  const items = await listAll(FLUX_KINDS)
  fluxCache = { at: Date.now(), items }
  return items
}

function districtResolver(fluxItems) {
  const paths = new Map()
  for (const item of fluxItems) {
    if (item.kind !== 'Kustomization') continue
    const top = (item.spec?.path ?? '').replace(/^\.?\//, '').split('/')[0]
    if (top) paths.set(item.metadata.name, top)
  }
  const releases = new Map()
  for (const item of fluxItems) {
    if (item.kind !== 'HelmRelease') continue
    const owner = paths.get(item.metadata.labels?.[KUSTOMIZATION_LABEL])
    const ns = item.spec?.targetNamespace ?? item.metadata.namespace
    if (!owner) continue
    if (!releases.has(ns)) releases.set(ns, [])
    releases.get(ns).push(owner)
  }
  return (name, items) => {
    const votes = [...(releases.get(name) ?? [])]
    for (const item of items) {
      const owner = paths.get(item.metadata.labels?.[KUSTOMIZATION_LABEL])
      if (owner && item.kind !== 'Pod') votes.push(owner)
    }
    if (votes.length) return mostCommon(votes)
    return /^(kube-|cilium)/.test(name) ? 'system' : 'other'
  }
}

function mostCommon(values) {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

function toNode(node) {
  const roles = Object.keys(node.metadata.labels ?? {})
    .filter(k => k.startsWith('node-role.kubernetes.io/'))
    .map(k => k.split('/')[1])
  return {
    name: node.metadata.name,
    ready: (node.status?.conditions ?? []).some(c => c.type === 'Ready' && c.status === 'True'),
    roles,
    kubelet: node.status?.nodeInfo?.kubeletVersion ?? null,
    cpu: node.status?.capacity?.cpu ?? null,
    memory: node.status?.capacity?.memory ?? null
  }
}

export async function fetchTopology(filter) {
  const [nsRaw, raw, nodesRaw, flux, policies, routes] = await Promise.all([
    run(['get', 'namespaces', '-o', 'json']),
    run(['get', KINDS, '-A', '-o', 'json']),
    run(['get', 'nodes', '-o', 'json']),
    fetchFlux(),
    fetchPolicies(),
    fetchRoutes()
  ])
  const districtOf = districtResolver(flux)
  const names = JSON.parse(nsRaw)
    .items.map(i => i.metadata.name)
    .filter(name => !filter.length || filter.includes(name))
    .sort()
  const byNamespace = new Map()
  for (const item of JSON.parse(raw).items) {
    const ns = item.metadata.namespace
    if (!byNamespace.has(ns)) byNamespace.set(ns, [])
    byNamespace.get(ns).push(item)
  }
  const namespaces = names.map(name => {
    const items = byNamespace.get(name) ?? []
    const built = buildNamespace(name, items)
    for (const pod of built.pods) pod.policy = policyForPod(policies, name, pod.labels)
    return { ...built, district: districtOf(name, items), policies: policiesInNamespace(policies, name) }
  })
  return { nodes: JSON.parse(nodesRaw).items.map(toNode), namespaces, entryPoints: findEntryPoints(namespaces, routes) }
}

function buildNamespace(name, items) {
  const byUid = new Map(items.map(i => [i.metadata.uid, i]))
  const pods = items.filter(i => i.kind === 'Pod').map(pod => toPod(pod, byUid))
  const workloads = new Map()

  for (const item of items) {
    if (!CONTROLLERS.has(item.kind)) continue
    const key = `${item.kind}/${item.metadata.name}`
    workloads.set(key, {
      key,
      kind: item.kind,
      name: item.metadata.name,
      desired: item.spec?.replicas ?? item.status?.desiredNumberScheduled ?? 0,
      ready: item.status?.readyReplicas ?? item.status?.numberReady ?? 0
    })
  }

  for (const pod of pods) {
    if (workloads.has(pod.workload)) continue
    const [kind, ...rest] = pod.workload.split('/')
    workloads.set(pod.workload, { key: pod.workload, kind, name: rest.join('/'), desired: 0, ready: 0 })
  }

  for (const w of workloads.values()) {
    const owned = pods.filter(p => p.workload === w.key)
    if (!CONTROLLERS.has(w.kind)) {
      w.desired = owned.length
      w.ready = owned.filter(p => p.ready).length
    }
  }

  const services = items
    .filter(i => i.kind === 'Service')
    .map(svc => {
      const selector = svc.spec?.selector ?? null
      const backends = selector ? pods.filter(p => matches(p.labels, selector)) : []
      return {
        name: svc.metadata.name,
        type: svc.spec?.type,
        clusterIP: svc.spec?.clusterIP,
        ports: (svc.spec?.ports ?? []).map(p => `${p.port}/${p.protocol}`),
        targets: targetPorts(svc, backends),
        backends: backends.map(p => p.name)
      }
    })

  return {
    name,
    workloads: [...workloads.values()].sort((a, b) => a.name.localeCompare(b.name)),
    pods: pods.sort((a, b) => a.name.localeCompare(b.name)),
    services: services.sort((a, b) => a.name.localeCompare(b.name))
  }
}

function toPod(pod, byUid) {
  const statuses = pod.status?.containerStatuses ?? []
  return {
    name: pod.metadata.name,
    ip: pod.status?.podIP ?? null,
    node: pod.spec?.nodeName ?? null,
    phase: pod.metadata.deletionTimestamp ? 'Terminating' : pod.status?.phase ?? 'Unknown',
    ready: statuses.length > 0 && statuses.every(s => s.ready),
    restarts: statuses.reduce((sum, s) => sum + (s.restartCount ?? 0), 0),
    containers: (pod.spec?.containers ?? []).map(c => c.name),
    ports: Object.fromEntries((pod.spec?.containers ?? []).flatMap(c => c.ports ?? []).filter(p => p.name).map(p => [p.name, p.containerPort])),
    labels: pod.metadata.labels ?? {},
    workload: workloadOf(pod, byUid)
  }
}

function workloadOf(pod, byUid) {
  const ref = pod.metadata.ownerReferences?.find(r => r.controller)
  if (!ref) return `Pod/${pod.metadata.name}`
  if (ref.kind === 'ReplicaSet' || ref.kind === 'Job') {
    const parent = byUid.get(ref.uid)?.metadata.ownerReferences?.find(r => r.controller)
    if (parent) return `${parent.kind}/${parent.name}`
  }
  return `${ref.kind}/${ref.name}`
}

function targetPorts(svc, backends) {
  const targets = new Set()
  for (const port of svc.spec?.ports ?? []) {
    const target = port.targetPort ?? port.port
    if (typeof target === 'number') targets.add(target)
    else backends.forEach(p => p.ports[target] && targets.add(p.ports[target]))
  }
  return [...targets]
}

function matches(labels, selector) {
  return Object.entries(selector).every(([k, v]) => labels[k] === v)
}
