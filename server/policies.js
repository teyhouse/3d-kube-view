import { listAll } from './kubectl.js'

const KINDS = ['ciliumnetworkpolicies.cilium.io', 'ciliumclusterwidenetworkpolicies.cilium.io', 'networkpolicies.networking.k8s.io']
const CACHE_MS = 30000
const NAMESPACE_LABEL = 'io.kubernetes.pod.namespace'

let cache = { at: 0, items: [] }

export async function fetchPolicies() {
  if (Date.now() - cache.at < CACHE_MS) return cache.items
  const items = (await listAll(KINDS)).flatMap(normalize)
  cache = { at: Date.now(), items }
  return items
}

function normalize(item) {
  const { kind, metadata } = item
  const base = { kind, name: metadata.name, namespace: metadata.namespace ?? null }
  if (kind === 'NetworkPolicy') return [{ ...base, ...fromNetworkPolicy(item.spec ?? {}) }]
  const specs = item.spec ? [item.spec] : item.specs ?? []
  return specs.map(spec => ({ ...base, ...fromCilium(spec) }))
}

function fromNetworkPolicy(spec) {
  const types = spec.policyTypes ?? (spec.egress ? ['Ingress', 'Egress'] : ['Ingress'])
  const state = (type, rules, peers) => {
    if (!types.includes(type)) return null
    return (rules ?? []).some(rule => !rule[peers]?.length && !rule.ports?.length) ? 'open' : 'restricted'
  }
  return {
    selector: spec.podSelector ?? {},
    ingress: state('Ingress', spec.ingress, 'from'),
    egress: state('Egress', spec.egress, 'to')
  }
}

function allowsEveryone(rule) {
  return !rule.toPorts?.length && [...(rule.fromEntities ?? []), ...(rule.toEntities ?? [])].includes('all')
}

function fromCilium(spec) {
  const state = (rules, denies, defaultDeny) => {
    if (denies?.length) return 'restricted'
    if (rules === undefined || defaultDeny === false) return null
    return rules.some(allowsEveryone) ? 'open' : 'restricted'
  }
  return {
    selector: spec.endpointSelector ?? spec.nodeSelector ?? {},
    ingress: state(spec.ingress, spec.ingressDeny, spec.enableDefaultDeny?.ingress),
    egress: state(spec.egress, spec.egressDeny, spec.enableDefaultDeny?.egress)
  }
}

function stripSource(key) {
  return key.replace(/^(k8s|any|cilium|reserved)[:.]/, '')
}

function selects(selector, labels) {
  const has = key => Object.hasOwn(labels, stripSource(key))
  const value = key => labels[stripSource(key)]
  for (const [key, expected] of Object.entries(selector.matchLabels ?? {})) {
    if (value(key) !== expected) return false
  }
  for (const { key, operator, values = [] } of selector.matchExpressions ?? []) {
    if (operator === 'In' && !values.includes(value(key))) return false
    if (operator === 'NotIn' && has(key) && values.includes(value(key))) return false
    if (operator === 'Exists' && !has(key)) return false
    if (operator === 'DoesNotExist' && has(key)) return false
  }
  return true
}

function combine(states) {
  if (states.includes('open')) return 'open'
  return states.includes('restricted') ? 'restricted' : 'none'
}

export function policyForPod(policies, namespace, podLabels) {
  const labels = { ...podLabels, [NAMESPACE_LABEL]: namespace }
  const matching = policies.filter(p => (p.namespace === null || p.namespace === namespace) && selects(p.selector, labels))
  return {
    ingress: combine(matching.map(p => p.ingress)),
    egress: combine(matching.map(p => p.egress)),
    names: matching.map(p => p.name)
  }
}

export function policiesInNamespace(policies, namespace) {
  return policies.filter(p => p.namespace === namespace).map(p => ({ name: p.name, kind: p.kind, ingress: p.ingress ?? 'none', egress: p.egress ?? 'none' }))
}
