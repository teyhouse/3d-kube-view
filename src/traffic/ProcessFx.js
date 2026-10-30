import { palette } from '../theme/palette.js'

const MAX_RECENT = 8

export class ProcessFx {
  constructor(world, tags) {
    this.world = world
    this.tags = tags
    this.counter = 0
    this.recentByPod = new Map()
  }

  remember(event) {
    if (event.type === 'exit') return
    const key = `${event.ns}/${event.pod}`
    const list = this.recentByPod.get(key) ?? []
    list.unshift(`${new Date().toLocaleTimeString()} ${nameOf(event)}`)
    list.length = Math.min(list.length, MAX_RECENT)
    this.recentByPod.set(key, list)
  }

  recent(ns, pod) {
    return this.recentByPod.get(`${ns}/${pod}`) ?? []
  }

  handle(events) {
    for (const event of events) {
      this.counter++
      this.remember(event)
      const room = this.world.rooms.get(event.ns)
      const station = room?.stations.get(event.pod)
      if (!station) continue
      const color = palette.process[event.type] ?? palette.process.other
      station.pulse(color)
      if (event.type === 'exit' || room.far) continue
      this.tags.add(nameOf(event), color, room.portWorld(event.pod), { ns: event.ns })
    }
  }
}

export function nameOf(event) {
  return event.type === 'exec' ? event.binary.split('/').pop() : event.fn ?? event.type
}
