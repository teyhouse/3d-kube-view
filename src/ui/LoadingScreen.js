const TRAFFIC_TIMEOUT_MS = 8000
const REVEAL_DELAY_MS = 500
const FADE_MS = 500

const TEMPLATE = `
  <div class="loading-card">
    <div class="loading-belt"><i></i><i></i><i></i></div>
    <ul class="loading-steps">
      <li data-step="stream" data-state="active"><span>Connecting to backend</span></li>
      <li data-step="topology"><span>Loading topology</span></li>
      <li data-step="traffic"><span>Waiting for traffic</span></li>
    </ul>
    <p class="loading-error" hidden></p>
  </div>
`

export class LoadingScreen {
  constructor(parent) {
    this.root = document.createElement('div')
    this.root.className = 'loading'
    this.root.innerHTML = TEMPLATE
    this.error = this.root.querySelector('.loading-error')
    this.done = false
    this.trafficTimer = null
    parent.append(this.root)
  }

  step(name) {
    return this.root.querySelector(`[data-step="${name}"]`)
  }

  complete(name, text) {
    const step = this.step(name)
    step.dataset.state = 'done'
    if (text) step.querySelector('span').textContent = text
  }

  connected() {
    if (this.done) return
    this.complete('stream', 'Connected to backend')
    this.clearError()
    if (this.step('topology').dataset.state !== 'done') this.step('topology').dataset.state = 'active'
  }

  disconnected() {
    if (!this.done) this.showError('Cannot reach the backend, retrying. Is the server still running?')
  }

  topologyLoaded(summary, expectTraffic) {
    if (this.done) return
    this.complete('topology', summary)
    this.clearError()
    if (!expectTraffic) return this.finish()
    this.step('traffic').dataset.state = 'active'
    this.trafficTimer ??= setTimeout(() => this.finish(), TRAFFIC_TIMEOUT_MS)
  }

  trafficArrived() {
    if (this.done || this.step('topology').dataset.state !== 'done') return
    this.complete('traffic', 'Traffic is flowing')
    setTimeout(() => this.finish(), REVEAL_DELAY_MS)
  }

  status({ source, state, message }) {
    if (this.done || state !== 'error') return
    this.showError(`${source}: ${message}`)
  }

  showError(text) {
    this.error.textContent = text
    this.error.hidden = false
  }

  clearError() {
    this.error.hidden = true
  }

  finish() {
    if (this.done) return
    this.done = true
    clearTimeout(this.trafficTimer)
    this.root.classList.add('leaving')
    setTimeout(() => this.root.remove(), FADE_MS)
  }
}
