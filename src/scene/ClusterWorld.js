import * as THREE from 'three'
import { NamespaceRoom } from '../objects/NamespaceRoom.js'
import { Portal } from '../objects/Portal.js'
import { disposeTree } from '../objects/primitives.js'

const ROOM_GAP = 14
const PORTAL_SPACING = 15
const PORTALS_PER_ROW = 9
const MOVE_TIME = 0.9
const EXIT_TIME = 0.6
const ENTER_DEPTH = -22
const CUTAWAY_INTERVAL = 0.2

const ease = t => t * t * (3 - 2 * t)

export class ClusterWorld {
  constructor() {
    this.root = new THREE.Group()
    this.rooms = new Map()
    this.order = []
    this.portals = new Map()
    this.slots = 0
    this.backZ = -45
    this.freeSlots = []
    this.exitRoot = new THREE.Group()
    this.exits = []
    this.moveT = 1
    this.moveK = 1
    this.ray = new THREE.Ray()
    this.cutawayTime = CUTAWAY_INTERVAL
  }

  setTopology(entries, { animate = true } = {}) {
    const next = new Map()
    const changed = []
    const entered = []
    const left = []
    let layoutChanged = entries.length !== this.order.length || entries.some((e, i) => this.order[i]?.namespace !== e.data.name)

    for (const { data, index } of entries) {
      const signature = `${index}:${JSON.stringify(data)}`
      const current = this.rooms.get(data.name)
      if (current?.signature === signature) {
        next.set(data.name, current)
        continue
      }
      const room = new NamespaceRoom(data, index)
      room.signature = signature
      if (current) {
        if (current.width !== room.width || current.depth !== room.depth) layoutChanged = true
        room.position.copy(current.position)
        room.scale.copy(current.scale)
        room.home.copy(current.home)
        room.from.copy(current.from)
        room.fromScale = current.fromScale
        room.fresh = false
        room.inherit(current)
        this.root.remove(current)
        disposeTree(current)
        changed.push(data.name)
      } else {
        entered.push(data.name)
      }
      next.set(data.name, room)
      this.root.add(room)
    }

    for (const [name, room] of this.rooms) {
      if (next.has(name)) continue
      left.push(name)
      this.exit(room, animate)
    }

    this.rooms = next
    this.order = entries.map(e => next.get(e.data.name))

    for (const [id, portal] of this.portals) {
      if (portal.ns && this.rooms.has(portal.ns)) this.removePortal(id, animate)
    }

    if (layoutChanged) this.layout(animate)
    return { layoutChanged, changed, entered, left }
  }

  layout(animate) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(this.order.length)))
    const rows = []
    for (let i = 0; i < this.order.length; i += cols) rows.push(this.order.slice(i, i + cols))

    let z = 0
    for (const row of rows) {
      const depth = Math.max(...row.map(r => r.depth))
      const width = row.reduce((sum, r) => sum + r.width, 0) + ROOM_GAP * (row.length - 1)
      let x = -width / 2
      for (const room of row) {
        room.home.set(x + room.width / 2, 0, z + room.depth / 2)
        x += room.width + ROOM_GAP
      }
      z += depth + ROOM_GAP
    }
    const offset = Math.max(0, z - ROOM_GAP) / 2
    for (const room of this.order) room.home.z -= offset
    this.backZ = -Math.max(offset, 11) - 30

    for (const room of this.order) {
      if (room.fresh) {
        room.position.copy(room.home)
        if (animate) {
          room.position.y = ENTER_DEPTH
          room.scale.setScalar(0.01)
        }
        room.fresh = false
      }
      room.from.copy(room.position)
      room.fromScale = room.scale.x
      if (!animate) room.position.copy(room.home)
    }
    for (const portal of this.portals.values()) {
      portal.home.copy(this.slotPosition(portal.slot))
      portal.from.copy(portal.position)
      if (!animate) portal.position.copy(portal.home)
    }

    this.moveT = animate ? 0 : 1
    this.moveK = animate ? 0 : 1
  }

  exit(object, animate = true) {
    if (!animate) {
      object.parent?.remove(object)
      disposeTree(object)
      return
    }
    this.exitRoot.add(object)
    this.exits.push({ object, t: 0 })
  }

  slotPosition(slot) {
    const i = slot % PORTALS_PER_ROW
    const side = i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2)
    return new THREE.Vector3(side * PORTAL_SPACING, 10, this.backZ - Math.floor(slot / PORTALS_PER_ROW) * PORTAL_SPACING)
  }

  portal(id, kind, name) {
    let portal = this.portals.get(id)
    if (!portal) {
      portal = new Portal(id, kind, name)
      portal.slot = this.freeSlots.length ? this.freeSlots.sort((a, b) => a - b).shift() : this.slots++
      portal.home.copy(this.slotPosition(portal.slot))
      portal.from.copy(portal.home)
      portal.position.copy(portal.home)
      this.portals.set(id, portal)
      this.root.add(portal)
    }
    return portal
  }

  removePortal(id, animate = true) {
    const portal = this.portals.get(id)
    if (!portal) return
    this.portals.delete(id)
    this.freeSlots.push(portal.slot)
    this.exit(portal, animate)
  }

  prunePortals(used) {
    for (const id of this.portals.keys()) {
      if (!used.has(id)) this.removePortal(id)
    }
  }

  anchor(id) {
    if (id.startsWith('room:')) return this.rooms.get(id.slice(5))?.hatchHome() ?? null
    return this.portals.get(id)?.home.clone() ?? null
  }

  locate(ep) {
    if (ep.kind === 'pod' || ep.kind === 'namespace') {
      const room = this.rooms.get(ep.ns)
      if (room) return { room, pod: ep.kind === 'pod' && room.stations.has(ep.name) ? ep.name : null }
      return { portal: this.portal(`ns:${ep.ns}`, 'namespace', ep.ns) }
    }
    if (ep.kind === 'host') return { portal: this.portal('host', 'host', 'Node') }
    return { portal: this.portal('world', 'world', 'Internet') }
  }

  roomsBounds() {
    const box = new THREE.Box3()
    for (const room of this.order) box.union(room.bounds())
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(30, 10, 30))
    return box
  }

  bounds() {
    const box = this.roomsBounds()
    for (const portal of this.portals.values()) box.expandByPoint(portal.home)
    return box
  }

  describe(pick) {
    if (!pick) return null
    const room = this.rooms.get(pick.ns)
    if (pick.type === 'pod') {
      const p = room?.pods.get(pick.id)
      if (!p) return null
      return {
        title: p.name,
        subtitle: `Pod in ${pick.ns}`,
        rows: [
          ['Phase', p.phase],
          ['Ready', p.ready ? 'yes' : 'no'],
          ['Restarts', p.restarts],
          ['IP', p.ip ?? 'none'],
          ['Node', p.node ?? 'none'],
          ['Workload', p.workload],
          ['Containers', p.containers.join(', ')]
        ]
      }
    }
    if (pick.type === 'workload') {
      const w = room?.workloads.get(pick.id)
      if (!w) return null
      return { title: w.name, subtitle: `${w.kind} in ${pick.ns}`, rows: [['Ready', `${w.ready}/${w.desired}`]] }
    }
    if (pick.type === 'service') {
      const s = room?.services.get(pick.id)
      if (!s) return null
      return {
        title: s.name,
        subtitle: `Service in ${pick.ns}`,
        rows: [
          ['Type', s.type],
          ['Cluster IP', s.clusterIP],
          ['Ports', s.ports.join(', ')],
          ['Backends', s.backends.join(', ') || 'none']
        ]
      }
    }
    if (pick.type === 'namespace' && room) {
      return {
        title: room.namespace,
        subtitle: 'Namespace',
        rows: [
          ['Workloads', room.workloads.size],
          ['Pods', room.pods.size],
          ['Services', room.services.size]
        ]
      }
    }
    if (pick.type === 'portal') return { title: pick.name, subtitle: pick.kind === 'namespace' ? 'Namespace (not rendered)' : 'External endpoint', rows: [] }
    return null
  }

  updateCutaway(dt, camera, target) {
    this.cutawayTime += dt
    if (this.cutawayTime < CUTAWAY_INTERVAL) return
    this.cutawayTime = 0
    this.ray.origin.copy(camera)
    this.ray.direction.subVectors(target, camera).normalize()
    const distance = camera.distanceTo(target)
    for (const room of this.order) room.updateCutaway(camera, this.ray, distance)
  }

  tick(dt, time) {
    if (this.moveT < 1) {
      this.moveT = Math.min(1, this.moveT + dt / MOVE_TIME)
      this.moveK = ease(this.moveT)
      for (const room of this.order) {
        room.position.lerpVectors(room.from, room.home, this.moveK)
        room.scale.setScalar(THREE.MathUtils.lerp(room.fromScale, 1, this.moveK))
      }
      for (const portal of this.portals.values()) portal.position.lerpVectors(portal.from, portal.home, this.moveK)
    }

    for (let i = this.exits.length - 1; i >= 0; i--) {
      const exit = this.exits[i]
      exit.t = Math.min(1, exit.t + dt / EXIT_TIME)
      exit.object.scale.setScalar(Math.max(0.001, 1 - ease(exit.t)))
      exit.object.position.y -= dt * 12
      if (exit.t < 1) continue
      this.exitRoot.remove(exit.object)
      disposeTree(exit.object)
      this.exits.splice(i, 1)
    }

    for (const room of this.order) room.tick(dt)
    for (const portal of this.portals.values()) portal.tick(dt, time)
  }
}
