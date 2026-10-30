export function isTyping(event) {
  return event.target instanceof HTMLInputElement && event.target.type !== 'checkbox'
}
