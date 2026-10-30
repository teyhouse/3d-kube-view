import * as THREE from 'three'
import { NamespaceRoom } from '../objects/NamespaceRoom.js'
import { Portal } from '../objects/Portal.js'
import { DistrictPlate } from '../objects/DistrictPlate.js'
import { NodeYard } from './NodeYard.js'
import { disposeTree } from '../objects/primitives.js'

const ROOM_GAP = 14
const PORTAL_SPACING = 15
const PORTALS_PER_ROW = 9
const MOVE_TIME = 0.9
const EXIT_TIME = 0.6
const ENTER_DEPTH = -22
const CUTAWAY_INTERVAL = 0.2
const DISTRICT_GAP = 22
const DISTRICT_SIDE = 7
const DISTRICT_FRONT = 13
const LOD_NEAR = 0.3
const LOD_FAR = 0.24
const YARD_GAP = 26
const YARD_Y = -3

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
    this.districts = true
    this.plates = new Map()
    this.anyNear = true
    this.yard = new NodeYard()
    this.yard.visible = false
    this.yardWanted = null
    this.frontZ = 0
    this.root.add(this.yard)
  }

  setTopology(entries, { animate = true, districts = true } = {}) {
    const next = new Map()
    const changed = []
    const entered = []
    const left = []
    let layoutChanged = districts !== this.districts || entries.length !== this.order.length || entries.some((e, i) => this.order[i]?.namespace !== e.data.name)
    this.districts = districts

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
        if (current.width !== room.width || current.depth !== room.depth || current.data.district !== data.district) layoutChanged = true
        room.setFar(current.far)
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
    const groups = this.groupRooms()
    const cols = Math.max(1, Math.ceil(Math.sqrt(groups.length)))
    let z = 0
    let minZ = 0
    let maxZ = 0
    const placed = []
    for (let i = 0; i < groups.length; i += cols) {
      const row = groups.slice(i, i + cols)
      const rowDepth = Math.max(...row.map(g => g.depth))
      const rowWidth = row.reduce((sum, g) => sum + g.width, 0) + DISTRICT_GAP * (row.length - 1)
      let x = -rowWidth / 2
      for (const group of row) {
        placed.push({ group, x: x + group.width / 2, z: z + group.depth / 2 })
        x += group.width + DISTRICT_GAP
      }
      z += rowDepth + DISTRICT_GAP
    }
    const offset = Math.max(0, z - DISTRICT_GAP) / 2

    const seen = new Set()
    for (const { group, x, z: gz } of placed) {
      const cz = gz - offset
      minZ = Math.min(minZ, cz - group.depth / 2)
      maxZ = Math.max(maxZ, cz + group.depth / 2)
      for (const room of group.rooms) room.home.set(x + room.relX, 0, cz + room.relZ)
      if (!group.name) continue
      seen.add(group.name)
      let plate = this.plates.get(group.name)
      if (!plate) {
        plate = new DistrictPlate(group.name)
        this.plates.set(group.name, plate)
        this.root.add(plate)
      }
      plate.target(x, cz, group.width, group.depth, DISTRICT_FRONT / 2)
    }
    for (const [name, plate] of this.plates) {
      if (seen.has(name)) continue
      this.plates.delete(name)
      this.exit(plate, animate)
    }
    if (!animate) this.plates.forEach(plate => plate.apply(1))

    this.backZ = Math.min(minZ, -11) - 30
    this.frontZ = maxZ
    this.placeYard()

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

  groupRooms() {
    const byName = new Map()
    for (const room of this.order) {
      const name = this.districts ? room.data.district ?? 'other' : null
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name).push(room)
    }
    const groups = [...byName].map(([name, rooms]) => this.layoutGroup(name, rooms))
    return groups.sort((a, b) => b.rooms.length - a.rooms.length || String(a.name).localeCompare(String(b.name)))
  }

  layoutGroup(name, rooms) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(rooms.length)))
    const rows = []
    for (let i = 0; i < rooms.length; i += cols) rows.push(rooms.slice(i, i + cols))
    const widths = rows.map(row => row.reduce((sum, r) => sum + r.width, 0) + ROOM_GAP * (row.length - 1))
    const contentW = Math.max(...widths)
    const side = name ? DISTRICT_SIDE : 0
    const front = name ? DISTRICT_FRONT : 0
    let z = 0
    rows.forEach((row, r) => {
      const depth = Math.max(...row.map(room => room.depth))
      let x = -widths[r] / 2
      for (const room of row) {
        room.relX = x + room.width / 2
        room.relZ = z + room.depth / 2
        x += room.width + ROOM_GAP
      }
      z += depth + ROOM_GAP
    })
    const contentD = Math.max(0, z - ROOM_GAP)
    const depth = contentD + side + front
    for (const room of rooms) room.relZ += side - depth / 2
    return { name, rooms, width: contentW + side * 2, depth }
  }

  placeYard() {
    this.yard.position.set(0, YARD_Y, this.frontZ + YARD_GAP)
  }

  updateNodes(topology) {
    this.yard.update(topology)
    this.yard.visible = this.yardWanted ?? topology.nodes.length > 1
  }

  toggleNodes() {
    this.yardWanted = !this.yard.visible
    this.yard.visible = this.yardWanted
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
    if (this.yard.visible) {
      box.expandByPoint(new THREE.Vector3(-this.yard.width / 2, YARD_Y, this.frontZ + YARD_GAP + this.yard.depth))
      box.expandByPoint(new THREE.Vector3(this.yard.width / 2, YARD_Y, this.frontZ + YARD_GAP + this.yard.depth))
    }
    return box
  }

  bounds() {
    const box = this.roomsBounds()
    for (const portal of this.portals.values()) box.expandByPoint(portal.home)
    return box
  }

  describe(pick) {
    if (!pick) return null
    if (pick.type === 'node') return this.yard.describe(pick.id)
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
          ['Containers', p.containers.join(', ')],
          ['Ingress', p.policy?.ingress ?? 'unknown'],
          ['Egress', p.policy?.egress ?? 'unknown']
        ],
        sections: [{ title: 'Network policies', items: p.policy?.names ?? [] }]
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
        ],
        sections: [{ title: 'Network policies', items: (room.data.policies ?? []).map(policy => `${policy.name} (in: ${policy.ingress}, out: ${policy.egress})`) }]
      }
    }
    if (pick.type === 'portal') return { title: pick.name, subtitle: pick.kind === 'namespace' ? 'Namespace (not rendered)' : 'External endpoint', rows: [] }
    return null
  }

  updateView(dt, camera, target) {
    this.cutawayTime += dt
    if (this.cutawayTime < CUTAWAY_INTERVAL) return
    this.cutawayTime = 0
    const eye = camera.position
    this.ray.origin.copy(eye)
    this.ray.direction.subVectors(target, eye).normalize()
    const distance = eye.distanceTo(target)
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    let anyNear = false
    for (const room of this.order) {
      room.updateCutaway(eye, this.ray, distance)
      const ratio = room.radius / (eye.distanceTo(room.home) * tanHalf)
      room.setFar(ratio < (room.far ? LOD_NEAR : LOD_FAR))
      anyNear ||= !room.far
    }
    this.anyNear = anyNear
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
      for (const plate of this.plates.values()) plate.apply(this.moveK)
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
