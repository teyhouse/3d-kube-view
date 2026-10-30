const SAMPLES = 120
const WIDTH = 150
const HEIGHT = 34
const SCALE_MS = 50
const UPDATE_MS = 500
const BUDGET_MS = 16.7

const el = (tag, className) => {
  const node = document.createElement(tag)
  node.className = className
  return node
}

export class PerfMeter {
  constructor(root) {
    root.classList.add('panel', 'perf')
    this.summary = el('div', 'perf-summary')
    this.timing = el('div', 'perf-timing')
    this.load = el('div', 'perf-timing')
    this.canvas = el('canvas', 'perf-graph')
    this.canvas.width = WIDTH
    this.canvas.height = HEIGHT
    this.ctx = this.canvas.getContext('2d')
    root.append(this.summary, this.canvas, this.timing, this.load)
    this.frames = new Float32Array(SAMPLES)
    this.cpu = new Float32Array(SAMPLES)
    this.head = 0
    this.filled = 0
    this.lastUpdate = 0
    this.gpuMs = null
    this.gpuSupported = true
  }

  record({ frameMs, cpuMs }, info) {
    this.frames[this.head] = frameMs
    this.cpu[this.head] = cpuMs
    this.head = (this.head + 1) % SAMPLES
    this.filled = Math.min(SAMPLES, this.filled + 1)
    const now = performance.now()
    if (now - this.lastUpdate < UPDATE_MS) return
    this.lastUpdate = now
    this.render(info)
  }

  render({ calls, triangles }) {
    const frames = Array.from(this.frames.subarray(0, this.filled)).sort((a, b) => a - b)
    const sum = frames.reduce((total, v) => total + v, 0)
    const avg = sum / Math.max(1, this.filled)
    const worst = frames[Math.max(0, Math.ceil(this.filled * 0.99) - 1)] ?? 0
    const cpu = Array.from(this.cpu.subarray(0, this.filled)).reduce((total, v) => total + v, 0) / Math.max(1, this.filled)
    const gpu = this.gpuSupported ? (this.gpuMs === null ? 'measuring' : `${this.gpuMs.toFixed(1)} ms`) : 'n/a'
    this.summary.textContent = `${avg > 0 ? Math.round(1000 / avg) : 0} fps`
    this.summary.dataset.state = avg > 33 ? 'bad' : avg > 20 ? 'warn' : 'ok'
    this.timing.textContent = `frame ${avg.toFixed(1)} ms · p99 ${worst.toFixed(1)} ms · cpu ${cpu.toFixed(1)} ms · gpu ${gpu}`
    this.load.textContent = `${calls} draws · ${(triangles / 1000).toFixed(0)}k tris`
    this.draw()
  }

  draw() {
    const { ctx } = this
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    const budgetY = HEIGHT - (BUDGET_MS / SCALE_MS) * HEIGHT
    ctx.fillStyle = 'rgba(241, 234, 255, 0.25)'
    ctx.fillRect(0, budgetY, WIDTH, 1)
    const barWidth = WIDTH / SAMPLES
    for (let i = 0; i < this.filled; i++) {
      const value = this.frames[(this.head - this.filled + i + SAMPLES) % SAMPLES]
      const height = Math.min(HEIGHT, (value / SCALE_MS) * HEIGHT)
      ctx.fillStyle = value > 33 ? '#ff6b7a' : value > 20 ? '#f7d48c' : '#c6e86e'
      ctx.fillRect(i * barWidth, HEIGHT - height, Math.max(1, barWidth - 0.25), height)
    }
  }
}
