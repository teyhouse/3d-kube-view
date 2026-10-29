export const config = {
  namespaces: (process.env.NAMESPACES ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  port: Number(process.env.PORT ?? 8080),
  kubectl: process.env.KUBECTL ?? 'kubectl',
  context: process.env.KUBE_CONTEXT ?? '',
  topologyIntervalMs: 5000,
  batchIntervalMs: 250,
  idleShutdownMs: 15000
}
