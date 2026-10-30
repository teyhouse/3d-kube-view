import * as THREE from 'three'
import { Tube } from '../objects/Tube.js'
import { HATCH } from '../objects/NamespaceRoom.js'
import { disposeTree } from '../objects/primitives.js'
import { palette } from '../theme/palette.js'
import { RoutePath, lineLeg, tubeLeg, remapProgress } from './RoutePath.js'

const IDLE_MS = 120000
const SWEEP_MS = 5000
const HISTORY_SECONDS = 30
const MIN_SPAWN_GAP_MS = 120
const HATCH_PACE = 0.45
const DOCK_PACE = 0.6
const MAX_SEED_PARCELS = 160
const FAR_SPAWN_GAP_MS = 1000
const MAX_CONNECTIONS = 8
const TAG_GAP_MS = 2500
const MAX_L7_RECENT = 8
const HEAT_DECAY = 0.7
const HEAT_RANGE = 8
const HEAT_INTERVAL_MS = 1000
const DROP_PROGRESS = 0.5

const dropPoint = new THREE.Vector3()

export class TrafficSystem {
  constructor(world, root, packages, tags, filter) {
    this.tags = tags
    this.filter = filter
    this.tagTimes = new Map()
    this.l7Recent = new Map()
    this.dropCounter = 0
    this.world = world
    this.root = root
    this.packages = packages
    this.tubes = new Map()
    this.routes = new Map()
    this.history = new Map()
    this.moving = new Set()
    this.counter = 0
    this.lastSweep = 0
    this.lastHeat = 0
    this.activity = new Map()
  }

  applyChange({ layoutChanged, dockChanged, changed, entered, left }) {
    const affected = new Set([...changed, ...entered, ...left])
    const remaps = new Map()

    for (const [key, route] of this.routes) {
      const touchesWorld = route.flow.src.kind === 'world' || route.flow.dst.kind === 'world'
      if (!route.namespaces.some(ns => affected.has(ns)) && !(dockChanged && touchesWorld)) continue
      const previous = route.path
      const next = this.buildPath(route.flow)
      if (!next) {
        remaps.set(route, { vanish: true })
        this.routes.delete(key)
        continue
      }
      route.path = next.path
      route.parts = next.parts
      route.onArrive = next.onArrive
      remaps.set(route, { map: u => remapProgress(previous, next.path, u) })
    }

    if (layoutChanged || dockChanged) this.retargetTubes()
    this.packages.retarget(remaps)
    this.dropUnusedTubes()
    this.seed(entered)
  }

  retargetTubes() {
    for (const [key, part] of this.tubes) {
      const tube = part.object
      const a = this.world.anchor(tube.startId)
      const b = this.world.anchor(tube.endId)
      if (!a || !b) continue
      if (!tube.retarget(a, b)) continue
      this.moving.add(tube)
      this.remeasure(key)
    }
  }

  remeasure(tubeKey) {
    const part = this.tubes.get(tubeKey)
    for (const route of this.routes.values()) {
      if (route.parts.includes(part)) route.path.measure()
    }
  }

  dropUnusedTubes() {
    const used = new Set()
    for (const route of this.routes.values()) route.parts.forEach(part => used.add(part))
    for (const [key, part] of this.tubes) {
      const tube = part.object
      if (used.has(part) && this.world.anchor(tube.startId) && this.world.anchor(tube.endId)) continue
      this.moving.delete(tube)
      this.root.remove(tube)
      disposeTree(tube)
      this.tubes.delete(key)
    }
  }

  seed(namespaces) {
    if (!namespaces.length) return
    const entered = new Set(namespaces)
    const now = performance.now()
    let budget = MAX_SEED_PARCELS
    for (const edge of this.history.values()) {
      if (budget <= 0) break
      if (now - edge.last > HISTORY_SECONDS * 1000) continue
      if (!entered.has(edge.flow.src.ns) && !entered.has(edge.flow.dst.ns)) continue
      const route = this.route(edge.flow, now)
      if (!route) continue
      const total = edge.buckets.reduce((sum, n) => sum + n, 0)
      const n = Math.min(3, Math.ceil(total / HISTORY_SECONDS) + 1)
      this.spawn(route, edge.flow, n, now)
      budget -= n
    }
  }

  record(flow, key, now) {
    const second = Math.floor(now / 1000)
    let edge = this.history.get(key)
    if (!edge) {
      edge = { flow, last: now, second, buckets: new Uint32Array(HISTORY_SECONDS), latency: null, drops: 0, reason: null }
      this.history.set(key, edge)
    }
    const gap = second - edge.second
    if (gap >= HISTORY_SECONDS) edge.buckets.fill(0)
    else for (let i = 1; i <= gap; i++) edge.buckets[(edge.second + i) % HISTORY_SECONDS] = 0
    edge.second = second
    edge.flow = flow
    edge.last = now
    edge.buckets[second % HISTORY_SECONDS] += flow.count
    if (flow.latencyMs) edge.latency = edge.latency === null ? flow.latencyMs : edge.latency * 0.8 + flow.latencyMs * 0.2
    if (flow.verdict === 'DROPPED') {
      edge.drops += flow.count
      edge.reason = flow.dropReason ?? edge.reason
    }
  }

  handle(flows) {
    const now = performance.now()
    for (const flow of flows) {
      this.counter += flow.count
      if (flow.src.ns) this.activity.set(flow.src.ns, now)
      if (flow.dst.ns) this.activity.set(flow.dst.ns, now)
      this.record(flow, this.keyOf(flow), now)
      if (flow.label) this.rememberL7(flow)
      const route = this.route(flow, now)
      if (!route) continue
      route.lastUsed = now
      route.parts.forEach(part => {
        part.lastUsed = now
        part.flows = (part.flows ?? 0) + flow.count
      })
      if (!this.filter.accepts(flow)) continue
      this.showTags(route, flow, now)
      if (flow.reply && this.filter.off.has('Replies')) continue
      route.pending += flow.count
      const far = route.namespaces.every(ns => this.world.rooms.get(ns)?.far ?? true)
      if (far && flow.reply) continue
      if (now - route.lastSpawn < (far ? FAR_SPAWN_GAP_MS : MIN_SPAWN_GAP_MS)) continue
      const fat = far ? Math.min(2.6, 1 + Math.log2(1 + route.pending) / 3) : null
      this.spawn(route, flow, far || flow.reply ? 1 : Math.min(route.pending, 3), now, fat)
      route.pending = 0
    }
  }

  rememberL7(flow) {
    const owner = flow.reply ? flow.dst : flow.src
    if (owner.kind !== 'pod') return
    const key = `${owner.ns}/${owner.name}`
    const list = this.l7Recent.get(key) ?? []
    const code = flow.code === null ? '' : ` ${flow.code}`
    const latency = flow.latencyMs ? ` ${flow.latencyMs.toFixed(1)} ms` : ''
    const text = `${flow.l7} ${flow.label}${code}${latency}`
    if (list[0] === text) return
    list.unshift(text)
    list.length = Math.min(list.length, MAX_L7_RECENT)
    this.l7Recent.set(key, list)
  }

  recentL7(ns, pod) {
    return this.l7Recent.get(`${ns}/${pod}`) ?? []
  }

  throttled(key, now) {
    if (now - (this.tagTimes.get(key) ?? 0) < TAG_GAP_MS) return true
    this.tagTimes.set(key, now)
    return false
  }

  showTags(route, flow, now) {
    if (flow.verdict === 'DROPPED') {
      if (!this.throttled(`drop:${flow.srcId}>${flow.dstId}`, now)) this.dropTag(route, flow)
      return
    }
    if (!flow.label) return
    const failed = flow.l7 === 'http' ? flow.code >= 400 : flow.l7 === 'dns' && flow.code > 0
    if (!failed && flow.l7Type === 'RESPONSE') return
    const owner = flow.reply ? flow.dst : flow.src
    const room = owner.kind === 'pod' ? this.world.rooms.get(owner.ns) : null
    if (!room || room.far || !room.stations.has(owner.name)) return
    if (this.throttled(`l7:${owner.ns}:${flow.label}:${failed}`, now)) return
    const text = failed ? `${flow.label} ${flow.code}` : flow.label
    const color = failed ? palette.dropped : palette.parcels[flow.l7]
    this.tags.add(text, color, room.portWorld(owner.name), { ns: owner.ns, size: 0.6 })
  }

  dropTag(route, flow) {
    const leg = route.path.sample(DROP_PROGRESS, dropPoint)
    if (route.path.legs[leg]?.room?.far) return
    this.tags.add(flow.dropReason ?? 'dropped', palette.dropped, dropPoint, { ns: flow.src.ns ?? flow.dst.ns, life: 4, size: 0.9 })
  }

  updateHeat() {
    const apply = part => {
      part.rate = (part.rate ?? 0) * HEAT_DECAY + (part.flows ?? 0) * (1 - HEAT_DECAY)
      part.flows = 0
      part.object.setHeat?.(Math.min(1, Math.log2(1 + part.rate) / HEAT_RANGE))
    }
    for (const part of this.tubes.values()) apply(part)
    for (const room of this.world.order) {
      if (!room.far) room.belts.lanes.forEach(apply)
    }
  }

  connections(ns, pod) {
    const id = `pod:${ns}/${pod}`
    const totals = new Map()
    for (const { flow, buckets, latency, drops, reason } of this.history.values()) {
      if (flow.reply || (flow.srcId !== id && flow.dstId !== id)) continue
      const out = flow.srcId === id
      const peer = out ? flow.dstId : flow.srcId
      const label = `${out ? 'to' : 'from'} ${peer.replace('pod:', '')}${flow.port ? `:${flow.port}` : ''}`
      const entry = totals.get(label) ?? { n: 0, latency: null, drops: 0, reason: null }
      entry.n += buckets.reduce((sum, n) => sum + n, 0)
      entry.latency = latency ?? entry.latency
      entry.drops += drops
      entry.reason = reason ?? entry.reason
      totals.set(label, entry)
    }
    return [...totals]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, MAX_CONNECTIONS)
      .map(([label, e]) => {
        const parts = [String(e.n)]
        if (e.latency !== null) parts.push(`${e.latency.toFixed(1)} ms`)
        if (e.drops) parts.push(`${e.drops} dropped: ${e.reason ?? 'unknown'}`)
        return `${label} (${parts.join(', ')})`
      })
  }

  spawn(route, flow, n, now, fat = null) {
    route.lastUsed = now
    route.lastSpawn = now
    route.parts.forEach(part => (part.lastUsed = now))
    const dropped = flow.verdict === 'DROPPED'
    const httpError = flow.l7 === 'http' && flow.code >= 400
    const color = dropped ? palette.dropped : httpError ? palette.httpError : palette.parcels[flow.l7] ?? palette.parcels[flow.proto] ?? palette.parcels.other
    for (let i = 0; i < n; i++) {
      this.packages.spawn(route, {
        color,
        dropped,
        scale: fat ?? (flow.reply ? 0.65 : 1),
        speed: flow.reply ? 11 : 9,
        delay: i * 0.16 + Math.random() * 0.12
      })
    }
  }

  gateFor(flow) {
    if (flow.reply || flow.dst.kind !== 'pod' || flow.src.kind === 'host') return null
    return this.world.rooms.get(flow.dst.ns)?.serviceFor(flow.dst.name, flow.port) ?? null
  }

  keyOf(flow) {
    return `${flow.srcId}>${flow.dstId}>${this.gateFor(flow) ?? ''}`
  }

  route(flow, now) {
    const key = this.keyOf(flow)
    let route = this.routes.get(key)
    if (route) return route
    const built = this.buildPath(flow)
    if (!built) return null
    route = { ...built, flow, lastUsed: now, lastSpawn: 0, pending: 0, namespaces: [flow.src.ns, flow.dst.ns].filter(Boolean) }
    this.routes.set(key, route)
    return route
  }

  buildPath(flow) {
    const { world } = this
    if (!world.rooms.has(flow.src.ns) && !world.rooms.has(flow.dst.ns)) return null
    const a = world.locate(flow.src)
    const b = world.locate(flow.dst)
    const legs = []
    const parts = []
    const gate = this.gateFor(flow)

    if (a.room && a.room === b.room) {
      const from = a.pod ?? HATCH
      const to = b.pod ?? HATCH
      if (from === to) return null
      this.inRoom(legs, parts, a.room, from, to, gate)
    } else {
      if (a.room) {
        if (a.pod) this.inRoom(legs, parts, a.room, a.pod, HATCH)
        legs.push(lineLeg(a.room, a.room.portLocal(HATCH), a.room.hatchOutsideLocal(), HATCH_PACE))
      }
      const bay = world.bayFor(flow)
      const startId = a.room ? `room:${a.room.namespace}` : a.portal.portalId
      const endId = b.room ? `room:${b.room.namespace}` : b.portal.portalId
      if (bay) this.throughDock(legs, parts, bay, startId, endId, flow.src.kind === 'world')
      else this.tube(legs, parts, startId, endId)
      if (b.room) {
        legs.push(lineLeg(b.room, b.room.hatchOutsideLocal(), b.room.portLocal(HATCH), HATCH_PACE))
        if (b.pod) this.inRoom(legs, parts, b.room, HATCH, b.pod, gate)
      }
    }

    if (!legs.length) return null
    const station = b.room && b.pod ? b.room.stations.get(b.pod) : null
    const portal = b.portal ?? null
    return { path: new RoutePath(legs), parts, onArrive: () => (station ? station.receive() : portal?.pulse()) }
  }

  inRoom(legs, parts, room, from, to, gateName = null) {
    const gate = gateName ? room.gates.get(gateName) : null
    const target = gate ? { x: gate.position.x, z: room.gateLaneZ } : null
    const plan = room.belts.plan(from, to, target)
    parts.push(...plan.parts)

    const start = room.portLocal(from)
    const end = room.portLocal(to)
    if (start.distanceToSquared(plan.path[0]) > 1e-4) legs.push(lineLeg(room, start, plan.path[0]))
    for (let i = 1; i < plan.path.length; i++) {
      const leg = lineLeg(room, plan.path[i - 1], plan.path[i])
      if (i === plan.gateIndex) leg.onEnter = () => gate.pulse()
      legs.push(leg)
    }
    const last = plan.path[plan.path.length - 1]
    if (end.distanceToSquared(last) > 1e-4) legs.push(lineLeg(room, last, end))
  }

  throughDock(legs, parts, bay, startId, endId, inbound) {
    const { dock } = this.world
    const first = inbound ? 'out' : 'in'
    const second = inbound ? 'in' : 'out'
    this.tube(legs, parts, startId, `bay:${first}:${bay}`)
    const leg = inbound ? lineLeg(dock, dock.outsideLocal(bay), dock.insideLocal(bay), DOCK_PACE) : lineLeg(dock, dock.insideLocal(bay), dock.outsideLocal(bay), DOCK_PACE)
    leg.onEnter = () => dock.pulse(bay)
    legs.push(leg)
    this.tube(legs, parts, `bay:${second}:${bay}`, endId)
  }

  tube(legs, parts, startId, endId) {
    const forward = startId < endId
    const key = forward ? `${startId}|${endId}` : `${endId}|${startId}`
    let part = this.tubes.get(key)
    if (!part) {
      const [first, second] = forward ? [startId, endId] : [endId, startId]
      part = { object: new Tube(this.world.anchor(first), this.world.anchor(second), first, second), lastUsed: performance.now() }
      this.root.add(part.object)
      this.tubes.set(key, part)
    }
    legs.push(tubeLeg(part.object, key, !forward))
    parts.push(part)
  }

  activeNamespaces(windowMs = 3000) {
    const now = performance.now()
    return new Set([...this.activity].filter(([, t]) => now - t < windowMs).map(([ns]) => ns))
  }

  tick() {
    if (this.moving.size) {
      const k = this.world.moveK
      for (const tube of this.moving) tube.advance(k)
      if (k >= 1) this.moving.clear()
    }

    const now = performance.now()
    if (now - this.lastHeat >= HEAT_INTERVAL_MS) {
      this.lastHeat = now
      this.updateHeat()
    }
    if (now - this.lastSweep < SWEEP_MS) return
    this.lastSweep = now
    this.sweep(now)
  }

  sweep(now) {
    for (const [key, route] of this.routes) {
      if (now - route.lastUsed > IDLE_MS) this.routes.delete(key)
    }
    for (const [key, edge] of this.history) {
      if (now - edge.last > HISTORY_SECONDS * 1000) this.history.delete(key)
    }
    for (const [key, time] of this.tagTimes) {
      if (now - time > TAG_GAP_MS) this.tagTimes.delete(key)
    }
    this.dropUnusedTubes()
    for (const room of this.world.order) room.belts.prune(now, IDLE_MS)
    this.world.prunePortals(new Set([...this.tubes.values()].flatMap(part => [part.object.startId, part.object.endId])))
  }
}
