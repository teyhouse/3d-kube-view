export function connect(handlers, { onOpen, onClose } = {}) {
  const source = new EventSource('/api/events')
  for (const [event, fn] of Object.entries(handlers)) {
    source.addEventListener(event, e => fn(JSON.parse(e.data)))
  }
  source.onopen = () => onOpen?.()
  source.onerror = () => onClose?.()
  return source
}
