export const config = {
  namespaces: (process.env.NAMESPACES ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  port: Number(process.env.PORT ?? 8080),
  kubectl: process.env.KUBECTL ?? 'kubectl',
  context: process.env.KUBE_CONTEXT ?? '',
  demo: process.env.DEMO === '1',
  ciliumNamespace: process.env.CILIUM_NAMESPACE ?? 'kube-system',
  ciliumSelector: process.env.CILIUM_SELECTOR ?? 'k8s-app=cilium',
  tetragonNamespace: process.env.TETRAGON_NAMESPACE ?? 'kube-system',
  tetragonSelector: process.env.TETRAGON_SELECTOR ?? 'app.kubernetes.io/name=tetragon',
  topologyIntervalMs: 5000,
  batchIntervalMs: 250,
  idleShutdownMs: 15000
}
