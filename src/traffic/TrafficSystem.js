import * as THREE from 'three'
import { Conveyor } from '../objects/Conveyor.js'
import { Tube } from '../objects/Tube.js'
import { HATCH } from '../objects/NamespaceRoom.js'
import { disposeTree } from '../objects/primitives.js'
import { palette } from '../theme/palette.js'

const IDLE_MS = 120000
const SWEEP_MS = 5000

export class TrafficSystem {
  constructor(world, root, packages) {
    this.world = world
    this.root = root
    this.packages = packages
    this.conveyors = new Map()
    this.tubes = new Map()
    this.routes = new Map()
    this.version = world.version
    this.counter = 0
    this.lastSweep = 0
    this.activity = new Map()
  }

  reset() {
    for (const part of [...this.conveyors.values(), ...this.tubes.values()]) {
      this.root.remove(part.object)
      disposeTree(part.object)
    }
    this.conveyors.clear()
    this.tubes.clear()
    this.routes.clear()
    this.packages.clear()
    this.version = this.world.version
  }

  invalidate(namespaces) {
    if (!namespaces.length) return
    const affected = new Set(namespaces)
    for (const [key, part] of this.conveyors) {
      if (!affected.has(key.slice(0, key.indexOf(':')))) continue
      this.root.remove(part.object)
      disposeTree(part.object)
      this.conveyors.delete(key)
    }
    for (const [key, route] of this.routes) {
      if (!route || route.rooms.some(ns => affected.has(ns))) this.routes.delete(key)
    }
  }

  handle(flows) {
    if (this.version !== this.world.version) this.reset()
    const now = performance.now()
    for (const flow of flows) {
      this.counter += flow.count
      if (flow.src.ns) this.activity.set(flow.src.ns, now)
      if (flow.dst.ns) this.activity.set(flow.dst.ns, now)
      const route = this.route(flow)
      if (!route) continue
      route.parts.forEach(part => (part.lastUsed = now))
      const color = flow.verdict === 'DROPPED' ? palette.dropped : palette.parcels[flow.l7] ?? palette.parcels[flow.proto] ?? palette.parcels.other
      const n = flow.reply ? 1 : Math.min(flow.count, 3)
      for (let i = 0; i < n; i++) {
        this.packages.spawn(route.path, {
          color,
          scale: flow.reply ? 0.65 : 1,
          dropped: flow.verdict === 'DROPPED',
          speed: flow.reply ? 11 : 9,
          delay: i * 0.16 + Math.random() * 0.12,
          onArrive: route.onArrive
        })
      }
    }
  }

  route(flow) {
    const key = `${flow.srcId}>${flow.dstId}`
    if (this.routes.has(key)) return this.routes.get(key)
    const route = this.build(flow)
    this.routes.set(key, route)
    return route
  }

  build(flow) {
    if (!this.world.rooms.has(flow.src.ns) && !this.world.rooms.has(flow.dst.ns)) return null
    const a = this.world.locate(flow.src)
    const b = this.world.locate(flow.dst)
    const path = new THREE.CurvePath()
    const parts = []

    if (a.room && a.room === b.room) {
      const from = a.pod ?? HATCH
      const to = b.pod ?? HATCH
      if (from === to) return null
      this.belt(path, parts, a.room, from, to)
    } else {
      if (a.portal && b.portal) return null
      if (a.room) {
        if (a.pod) this.belt(path, parts, a.room, a.pod, HATCH)
        line(path, a.room.portWorld(HATCH), a.room.hatchOutside())
      }
      const startId = a.room ? `room:${a.room.namespace}` : a.portal.portalId
      const endId = b.room ? `room:${b.room.namespace}` : b.portal.portalId
      const start = a.room ? a.room.hatchOutside() : a.portal.anchor()
      const end = b.room ? b.room.hatchOutside() : b.portal.anchor()
      this.tube(path, parts, startId, endId, start, end)
      if (b.room) {
        line(path, b.room.hatchOutside(), b.room.portWorld(HATCH))
        if (b.pod) this.belt(path, parts, b.room, HATCH, b.pod)
      }
    }

    if (!path.curves.length) return null
    const station = b.room && b.pod ? b.room.stations.get(b.pod) : null
    const portal = b.portal ?? null
    const rooms = [a.room?.namespace, b.room?.namespace].filter(Boolean)
    return { path, parts, rooms, onArrive: () => (station ? station.receive() : portal?.pulse()) }
  }

  belt(path, parts, room, from, to) {
    const p0 = room.portWorld(from)
    const p1 = room.beltWorld(from)
    const p2 = room.beltWorld(to)
    const p3 = room.portWorld(to)
    line(path, p0, p1)
    line(path, p1, p2)
    line(path, p2, p3)
    const key = `${room.namespace}:${[from, to].sort().join('|')}`
    let part = this.conveyors.get(key)
    if (!part) {
      part = { object: new Conveyor(p1, p2), lastUsed: 0 }
      this.root.add(part.object)
      this.conveyors.set(key, part)
    }
    parts.push(part)
  }

  tube(path, parts, startId, endId, start, end) {
    const forward = startId < endId
    const key = forward ? `${startId}|${endId}` : `${endId}|${startId}`
    let part = this.tubes.get(key)
    if (!part) {
      part = { object: forward ? new Tube(start, end) : new Tube(end, start), lastUsed: 0 }
      this.root.add(part.object)
      this.tubes.set(key, part)
    }
    path.add(forward ? part.object.curve : part.object.reverse)
    parts.push(part)
  }

  activeNamespaces(windowMs = 3000) {
    const now = performance.now()
    return new Set([...this.activity].filter(([, t]) => now - t < windowMs).map(([ns]) => ns))
  }

  tick() {
    const now = performance.now()
    if (now - this.lastSweep < SWEEP_MS) return
    this.lastSweep = now
    let removed = false
    for (const map of [this.conveyors, this.tubes]) {
      for (const [key, part] of map) {
        if (now - part.lastUsed < IDLE_MS) continue
        this.root.remove(part.object)
        disposeTree(part.object)
        map.delete(key)
        removed = true
      }
    }
    if (removed) {
      this.routes.clear()
      this.packages.clear()
    }
  }
}

function line(path, a, b) {
  if (a.distanceToSquared(b) < 0.0001) return
  path.add(new THREE.LineCurve3(a.clone(), b.clone()))
}
