import { run } from './kubectl.js'

const KINDS = 'pods,services,deployments,statefulsets,daemonsets,replicasets,jobs'
const CONTROLLERS = new Set(['Deployment', 'StatefulSet', 'DaemonSet'])

export async function fetchTopology(filter) {
  const [nsRaw, raw] = await Promise.all([run(['get', 'namespaces', '-o', 'json']), run(['get', KINDS, '-A', '-o', 'json'])])
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
  return { namespaces: names.map(name => buildNamespace(name, byNamespace.get(name) ?? [])) }
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
      return {
        name: svc.metadata.name,
        type: svc.spec?.type,
        clusterIP: svc.spec?.clusterIP,
        ports: (svc.spec?.ports ?? []).map(p => `${p.port}/${p.protocol}`),
        backends: selector ? pods.filter(p => matches(p.labels, selector)).map(p => p.name) : []
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

function matches(labels, selector) {
  return Object.entries(selector).every(([k, v]) => labels[k] === v)
}
