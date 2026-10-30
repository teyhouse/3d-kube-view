const RETENTION_MS = 5 * 60 * 1000
const MAX_ITEMS = 120000

export class Timeline {
  constructor(dispatch) {
    this.dispatch = dispatch
    this.entries = []
    this.items = 0
    this.live = true
    this.paused = false
    this.cursor = 0
    this.index = 0
    this.speed = 1
    this.onSeek = () => {}
  }

  get oldest() {
    return this.entries[0]?.t ?? Date.now()
  }

  push(kind, items) {
    const t = Date.now()
    this.entries.push({ t, kind, items })
    this.items += items.length
    while (this.entries.length && (t - this.entries[0].t > RETENTION_MS || this.items > MAX_ITEMS)) {
      this.items -= this.entries.shift().items.length
      if (!this.live) this.index = Math.max(0, this.index - 1)
    }
    if (this.live) this.dispatch(kind, items, false)
  }

  togglePause() {
    if (this.paused) {
      this.paused = false
      return
    }
    this.paused = true
    if (this.live) {
      this.live = false
      this.cursor = Date.now()
      this.index = this.entries.length
    }
  }

  seek(t) {
    this.live = false
    this.paused = false
    this.cursor = t
    const found = this.entries.findIndex(entry => entry.t >= t)
    this.index = found < 0 ? this.entries.length : found
    this.onSeek()
  }

  goLive() {
    this.live = true
    this.paused = false
    this.speed = 1
  }

  tick(dt) {
    if (this.live || this.paused) return
    this.cursor += dt * 1000 * this.speed
    while (this.index < this.entries.length && this.entries[this.index].t <= this.cursor) {
      const { kind, items } = this.entries[this.index++]
      this.dispatch(kind, items, true)
    }
    if (this.cursor >= Date.now()) this.goLive()
  }
}
