import * as THREE from 'three'
import { Conveyor } from './Conveyor.js'
import { block, disposeTree } from './primitives.js'
import { surface } from '../theme/materials.js'
import { palette } from '../theme/palette.js'

const PILLAR_GAP = 7
const PILLAR_SEARCH = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3, -3]
const EPSILON = 0.01
const HATCH = '__hatch__'

export class BeltNetwork extends THREE.Group {
  constructor(room) {
    super()
    this.room = room
    this.lanes = new Map()
    this.junctions = new Map()
  }

  plan(from, to, gate = null) {
    const { room } = this
    const y = room.beltY
    const start = room.beltPoint(from)
    const end = room.beltPoint(to)
    const trunk = room.trunkZ
    const waypoints = this.waypoints(from, to, start, end, gate)

    const points = waypoints.filter((p, i) => i === 0 || Math.hypot(p[0] - waypoints[i - 1][0], p[1] - waypoints[i - 1][1]) > EPSILON)
    const parts = []
    for (let i = 1; i < points.length; i++) {
      parts.push(this.lane(points[i - 1], points[i]))
      if (i < points.length - 1) parts.push(this.junction(points[i]))
    }

    const path = points.map(([x, z]) => new THREE.Vector3(x, y, z))
    const gateIndex = gate ? points.findIndex(p => Math.abs(p[0] - gate.x) < EPSILON && Math.abs(p[1] - gate.z) < EPSILON) : -1
    return { path, parts, gateIndex }
  }

  prebuild(from, to, gate) {
    for (const part of this.plan(from, to, gate).parts) part.keep = true
  }

  waypoints(from, to, start, end, gate) {
    const { room } = this
    const trunk = room.trunkZ
    const sameAisle = Math.abs(start[0] - end[0]) < EPSILON

    if (room.bypassX === null) {
      return sameAisle ? [start, end] : [start, [start[0], trunk], [end[0], trunk], end]
    }

    const lane = room.gateLaneZ
    const toLane = point => [point[0], lane]
    const toTrunk = [[room.bypassX, lane], [room.bypassX, trunk]]

    if (gate) {
      const entry = from === HATCH ? [start] : [start, toLane(start), ...toTrunk]
      return [...entry, [gate.x, trunk], [gate.x, lane], toLane(end), end]
    }
    if (from === HATCH) return [start, [room.bypassX, trunk], [room.bypassX, lane], toLane(end), end]
    if (to === HATCH) return [start, toLane(start), ...toTrunk, end]
    return sameAisle ? [start, end] : [start, toLane(start), toLane(end), end]
  }

  lane(a, b) {
    const alongX = Math.abs(a[1] - b[1]) < EPSILON
    const coord = alongX ? a[1] : a[0]
    const min = Math.min(alongX ? a[0] : a[1], alongX ? b[0] : b[1])
    const max = Math.max(alongX ? a[0] : a[1], alongX ? b[0] : b[1])
    const key = `${alongX ? 'x' : 'z'}:${coord.toFixed(2)}`
    let lane = this.lanes.get(key)
    if (!lane) {
      lane = { alongX, coord, min, max, object: null, lastUsed: performance.now() }
      this.lanes.set(key, lane)
      this.rebuild(lane)
    } else if (min < lane.min - EPSILON || max > lane.max + EPSILON) {
      lane.min = Math.min(lane.min, min)
      lane.max = Math.max(lane.max, max)
      this.rebuild(lane)
    }
    return lane
  }

  rebuild(lane) {
    if (lane.object) {
      this.remove(lane.object)
      disposeTree(lane.object)
    }
    const y = this.room.beltY
    const point = v => (lane.alongX ? new THREE.Vector3(v, y, lane.coord) : new THREE.Vector3(lane.coord, y, v))
    lane.object = new Conveyor(point(lane.min), point(lane.max), this.pillars(lane))
    this.add(lane.object)
  }

  pillars(lane) {
    const length = lane.max - lane.min
    if (length < 2) return []
    const count = Math.max(1, Math.round(length / PILLAR_GAP))
    const spots = []
    for (let i = 0; i < count; i++) {
      const base = (length * (i + 0.5)) / count
      for (const shift of PILLAR_SEARCH) {
        const offset = base + shift
        if (offset < 0.4 || offset > length - 0.4) continue
        const v = lane.min + offset
        if (this.room.isClear(lane.alongX ? v : lane.coord, lane.alongX ? lane.coord : v)) {
          spots.push(offset)
          break
        }
      }
    }
    return spots
  }

  junction([x, z]) {
    const key = `${x.toFixed(2)}:${z.toFixed(2)}`
    let junction = this.junctions.get(key)
    if (!junction) {
      const object = block(1.5, 0.34, 1.5, surface(palette.junction), { radius: 0.12 })
      object.position.set(x, this.room.beltY - 0.3, z)
      this.add(object)
      junction = { object, lastUsed: performance.now() }
      this.junctions.set(key, junction)
    }
    return junction
  }

  prune(now, idleMs) {
    for (const map of [this.lanes, this.junctions]) {
      for (const [key, part] of map) {
        if (part.keep || now - part.lastUsed < idleMs) continue
        this.remove(part.object)
        disposeTree(part.object)
        map.delete(key)
      }
    }
  }
}
