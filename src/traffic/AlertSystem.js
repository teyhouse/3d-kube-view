import { palette } from '../theme/palette.js'

const MERGE_MS = 30000
const MAX_ALERTS = 100
const TAG_GAP_MS = 8000

export class AlertSystem {
  constructor(world, tags) {
    this.world = world
    this.tags = tags
    this.alerts = []
    this.byKey = new Map()
    this.tagTimes = new Map()
    this.onChange = () => {}
  }

  handle(events, replay) {
    let changed = false
    for (const event of events) {
      if (!event.severity) continue
      const room = this.world.rooms.get(event.ns)
      room?.raiseAlert(event.pod, event.severity)
      if (room && !room.far) {
        const station = room.stations.get(event.pod)
        if (station && this.tagDue(event)) this.tags.add(titleOf(event), palette.alert[event.severity], room.portWorld(event.pod), { ns: event.ns, life: 5, size: 0.9 })
      }
      if (replay) continue
      this.record(event)
      changed = true
    }
    if (changed) this.onChange(this.alerts)
  }

  tagDue(event) {
    const key = `${event.ns}/${event.pod}|${titleOf(event)}`
    const now = Date.now()
    if (now - (this.tagTimes.get(key) ?? 0) < TAG_GAP_MS) return false
    this.tagTimes.set(key, now)
    return true
  }

  record(event) {
    const now = Date.now()
    const title = titleOf(event)
    const key = `${event.ns}/${event.pod}|${title}|${event.target ?? event.binary}`
    const existing = this.byKey.get(key)
    if (existing && now - existing.last < MERGE_MS) {
      existing.count++
      existing.last = now
      return
    }
    const alert = { key, ns: event.ns, pod: event.pod, severity: event.severity, title, detail: event.target ?? event.binary, count: 1, last: now }
    this.byKey.set(key, alert)
    this.alerts.unshift(alert)
    for (const old of this.alerts.splice(MAX_ALERTS)) this.byKey.delete(old.key)
  }

  clear() {
    this.alerts = []
    this.byKey.clear()
    this.onChange(this.alerts)
  }
}

function titleOf(event) {
  return event.severity === 'warn' ? 'privileged exec' : event.policy ?? event.fn ?? event.type
}
