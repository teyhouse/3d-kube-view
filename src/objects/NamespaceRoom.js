import * as THREE from 'three'
import { block, textPlane, textSprite, disposeTree } from './primitives.js'
import { batchStatic } from './batchStatic.js'
import { PodStation } from './PodStation.js'
import { WorkloadPad } from './WorkloadPad.js'
import { ServiceGate } from './ServiceGate.js'
import { BeltNetwork } from './BeltNetwork.js'
import { surface } from '../theme/materials.js'
import { palette } from '../theme/palette.js'

export const BELT_Y = 4.8
export const HATCH = '__hatch__'

const CELL = 3.3
const GAP = 2
const MAX_ROW = 26
const WALL_H = 10
const WALL_T = 0.8
const GATE_SPACING = 5.5
const WALL_CUT = 0.1
const WALL_SPEED = 7
const LABEL_MIN = 0.6
const FOOTPRINT = 1.5
const AISLE = CELL / 2
const GATE_LANE = 2
const SUMMARY_CELL = 1.7
const SUMMARY_POD = new THREE.BoxGeometry(1.2, 1, 1.2)
const summaryDummy = new THREE.Object3D()
const summaryTint = new THREE.Color()

const scratchBox = new THREE.Box3()
const scratchPoint = new THREE.Vector3()

export class NamespaceRoom extends THREE.Group {
  constructor(data, index) {
    super()
    this.namespace = data.name
    this.data = data
    this.index = index
    this.stations = new Map()
    this.pods = new Map(data.pods.map(p => [p.name, p]))
    this.workloads = new Map(data.workloads.map(w => [w.key, w]))
    this.services = new Map(data.services.map(s => [s.name, s]))
    this.gates = new Map()
    this.obstacles = []
    this.leaving = []
    this.home = new THREE.Vector3()
    this.from = new THREE.Vector3()
    this.fromScale = 1
    this.fresh = true
    this.beltY = BELT_Y
    this.serviceIndex = new Map()
    for (const service of data.services) {
      for (const pod of service.backends) {
        for (const port of service.targets ?? []) this.serviceIndex.set(`${pod}:${port}`, service.name)
      }
    }

    const plan = this.plan()
    this.width = plan.width
    this.depth = plan.depth
    this.hatchX = -this.width / 2 + WALL_T + 4.5

    this.radius = Math.hypot(this.width, this.depth) / 2
    this.far = false
    this.detail = new THREE.Group()
    this.add(this.detail)
    this.buildShell()
    this.buildContent(plan)
    this.buildSummary()
    this.belts = new BeltNetwork(this)
    this.detail.add(this.belts)
    this.userData.pick = { type: 'namespace', id: this.namespace, ns: this.namespace }
  }

  plan() {
    const items = this.data.workloads.map(workload => {
      const pods = this.data.pods.filter(p => p.workload === workload.key)
      const cols = Math.max(1, Math.min(pods.length, 4))
      const rows = Math.max(1, Math.ceil(pods.length / cols))
      return { workload, pods, cols, rows, w: cols * CELL + 1, d: rows * CELL + 1.9 }
    })

    let x = 0
    let z = 0
    let rowDepth = 0
    let contentW = 0
    for (const item of items) {
      if (x > 0 && x + item.w > MAX_ROW) {
        z += rowDepth + GAP
        x = 0
        rowDepth = 0
      }
      item.x = x
      item.z = z
      x += item.w + GAP
      rowDepth = Math.max(rowDepth, item.d)
      contentW = Math.max(contentW, x - GAP)
    }
    const contentD = z + rowDepth

    const gatesW = this.data.services.length * GATE_SPACING
    const width = Math.max(18, contentW + 10, gatesW + 6)
    const depth = Math.max(17, contentD + 13)

    const left = -width / 2 + WALL_T + 2 + (width - WALL_T - 4 - contentW) / 2
    const top = -depth / 2 + WALL_T + 3.5
    for (const item of items) {
      item.cx = left + item.x + item.w / 2
      item.cz = top + item.z + item.d / 2
    }
    return { items, width, depth }
  }

  buildShell() {
    const { width: W, depth: D } = this
    const floor = block(W, 3, D, surface(palette.floor), { radius: 0.35, shared: false })
    floor.position.y = -1.5

    this.trunkZ = -D / 2 + WALL_T + 1.2
    this.gateZ = D / 2 - 3.2
    this.gateLaneZ = this.gateZ + GATE_LANE
    this.cutBack = false
    this.cutLeft = false

    const back = block(W, WALL_H, WALL_T, surface(palette.wallDark), { radius: 0.25, shared: false })
    back.position.set(0, WALL_H / 2, -D / 2 + WALL_T / 2)

    const left = block(WALL_T, WALL_H + 1.5, D, surface(palette.wallLight), { radius: 0.25, shared: false })
    left.position.set(-W / 2 + WALL_T / 2, (WALL_H + 1.5) / 2, 0)

    const wallZ = -D / 2 + WALL_T + 0.02
    const number = textPlane(String(this.index + 1).padStart(2, '0'), 4.4, { color: '#e3d8ff', padding: 0.1 })
    number.position.set(W / 2 - 4.2, WALL_H - 2.8, wallZ)
    const title = textPlane(this.namespace.toUpperCase(), 1.3, { color: '#e3d8ff', maxWidth: Math.min(W * 0.45, 12) })
    title.position.set(W / 2 - 4.2, WALL_H - 5.6, wallZ)

    const sideLabel = textPlane(`←  ${this.data.pods.length} PODS  →`, 1, { color: palette.textOnWall, maxWidth: D * 0.6 })
    sideLabel.rotation.y = Math.PI / 2
    sideLabel.position.set(-W / 2 + WALL_T + 0.02, 7.6, 0)

    const trafficLabel = textPlane('←  TRAFFIC  →', 0.8, { color: '#b9a8e4' })
    trafficLabel.position.set(this.hatchX, BELT_Y + 2, wallZ)

    const hatchFrame = block(3.4, 2.6, WALL_T + 0.3, surface(palette.trim), { radius: 0.25 })
    hatchFrame.position.set(this.hatchX, BELT_Y - 0.1, -D / 2 + WALL_T / 2)
    const hatchHole = block(2.7, 1.9, WALL_T + 0.42, surface(palette.hole, { roughness: 1 }), { radius: 0.2 })
    hatchHole.position.copy(hatchFrame.position)

    this.backWall = new THREE.Group()
    this.backWall.add(back, number, title, trafficLabel)
    this.leftWall = new THREE.Group()
    this.leftWall.add(left, sideLabel)
    this.wallLabels = [[this.backWall, [number, title, trafficLabel]], [this.leftWall, [sideLabel]]]
    this.smallLabels = [trafficLabel, sideLabel]
    this.backBox = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(W / 2, WALL_H, -D / 2 + WALL_T))
    this.leftBox = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(-W / 2 + WALL_T, WALL_H + 1.5, D / 2))

    this.add(floor, this.backWall, this.leftWall, hatchFrame, hatchHole)
  }

  buildContent({ items }) {
    const statics = []
    for (const item of items) {
      const pad = new WorkloadPad(item.workload, item.w, item.d, this.namespace)
      pad.position.set(item.cx, 0, item.cz)
      this.obstacles.push({ x: item.cx, z: item.cz + item.d / 2 - 0.55, hx: Math.min(item.w - 0.6, 4.4) / 2 + 0.3, hz: 0.5 })
      this.detail.add(pad)
      statics.push(pad)
      item.pods.forEach((pod, i) => {
        const col = i % item.cols
        const row = Math.floor(i / item.cols)
        const station = new PodStation({ ...pod, namespace: this.namespace }, shortName(pod, item.workload))
        station.place(item.cx - item.w / 2 + 0.5 + CELL * (col + 0.5), 0.2, item.cz - item.d / 2 + 0.4 + CELL * (row + 0.5))
        this.obstacles.push({ x: station.home.x, z: station.home.z, hx: FOOTPRINT, hz: FOOTPRINT })
        this.detail.add(station)
        this.stations.set(pod.name, station)
      })
    }

    const services = this.data.services
    services.forEach((service, i) => {
      const gate = new ServiceGate(service, this.namespace)
      gate.position.set((i - (services.length - 1) / 2) * GATE_SPACING, 0, this.gateZ)
      this.obstacles.push({ x: gate.position.x, z: gate.position.z, hx: 2.5, hz: 0.8 })
      this.gates.set(service.name, gate)
      this.detail.add(gate)
      statics.push(gate)
    })
    batchStatic(this.detail, statics)
  }

  buildSummary() {
    const pods = this.data.pods
    this.summary = new THREE.Group()
    this.summary.visible = false
    const sign = textSprite(this.namespace, 3.2, { color: palette.text, background: '#2a2150', weight: 600 })
    sign.position.y = WALL_H + 4
    this.summary.add(sign)
    if (pods.length) {
      const cols = Math.ceil(Math.sqrt(pods.length))
      const mesh = new THREE.InstancedMesh(SUMMARY_POD, surface(0xffffff), pods.length)
      pods.forEach((pod, i) => {
        const height = 1 + Math.min(pod.containers.length, 3) * 0.5
        summaryDummy.position.set(((i % cols) - (cols - 1) / 2) * SUMMARY_CELL + 1, height / 2, (Math.floor(i / cols) - (cols - 1) / 2) * SUMMARY_CELL + 1)
        summaryDummy.scale.set(1, height, 1)
        summaryDummy.updateMatrix()
        mesh.setMatrixAt(i, summaryDummy.matrix)
        const status = pod.phase === 'Running' && !pod.ready ? 'NotReady' : pod.phase
        mesh.setColorAt(i, summaryTint.set(palette.status[status] ?? palette.status.Unknown))
      })
      mesh.castShadow = true
      this.summary.add(mesh)
    }
    this.add(this.summary)
  }

  setFar(far) {
    if (far === this.far) return
    this.far = far
    this.detail.visible = !far
    this.summary.visible = far
    this.smallLabels.forEach(label => (label.visible = !far))
  }

  portLocal(key) {
    if (key === HATCH) return new THREE.Vector3(this.hatchX, BELT_Y, this.trunkZ)
    const station = this.stations.get(key)
    return station.home.clone().setY(station.home.y + station.topY)
  }

  portWorld(key) {
    return this.portLocal(key).add(this.position)
  }

  beltPoint(key) {
    const port = this.portLocal(key)
    return key === HATCH ? [port.x, port.z] : [port.x + AISLE, port.z]
  }

  hatchOutsideLocal() {
    return new THREE.Vector3(this.hatchX, BELT_Y, -this.depth / 2 - 0.6)
  }

  hatchHome() {
    return this.hatchOutsideLocal().add(this.home)
  }

  serviceFor(pod, port) {
    return this.serviceIndex.get(`${pod}:${port}`) ?? null
  }

  isClear(x, z) {
    return !this.obstacles.some(o => Math.abs(x - o.x) < o.hx && Math.abs(z - o.z) < o.hz)
  }

  inherit(previous) {
    for (const [name, station] of this.stations) {
      const old = previous.stations.get(name)
      if (!old) {
        station.enter()
        continue
      }
      station.glideFrom(old.position)
      if (this.pods.get(name).restarts > previous.pods.get(name).restarts) station.shake()
    }
    for (const [name, station] of previous.stations) {
      if (this.stations.has(name)) continue
      this.detail.add(station)
      station.exit()
      this.leaving.push(station)
    }
    for (const station of previous.leaving) {
      this.detail.add(station)
      this.leaving.push(station)
    }
    this.cutBack = previous.cutBack
    this.cutLeft = previous.cutLeft
    this.backWall.scale.y = previous.backWall.scale.y
    this.leftWall.scale.y = previous.leftWall.scale.y
  }

  updateCutaway(camera, ray, targetDistance) {
    this.cutBack = camera.z < this.home.z - this.depth / 2 || this.blocks(ray, this.backBox, targetDistance)
    this.cutLeft = camera.x < this.home.x - this.width / 2 || this.blocks(ray, this.leftBox, targetDistance)
  }

  blocks(ray, box, targetDistance) {
    scratchBox.copy(box).translate(this.home)
    const hit = ray.intersectBox(scratchBox, scratchPoint)
    return hit !== null && hit.distanceTo(ray.origin) < targetDistance
  }

  lampWorld() {
    return new THREE.Vector3(-this.width / 4, 8, -this.depth / 4).add(this.position)
  }

  bounds() {
    const box = new THREE.Box3(new THREE.Vector3(-this.width / 2, -3, -this.depth / 2), new THREE.Vector3(this.width / 2, WALL_H, this.depth / 2))
    return box.translate(this.home)
  }

  tick(dt) {
    if (!this.far) {
      for (const station of this.stations.values()) station.tick(dt)
      for (const gate of this.gates.values()) gate.tick(dt)
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const station = this.leaving[i]
      station.tick(dt)
      if (!station.done) continue
      this.remove(station)
      disposeTree(station)
      this.leaving.splice(i, 1)
    }
    this.easeWall(this.backWall, this.cutBack, dt)
    this.easeWall(this.leftWall, this.cutLeft, dt)
  }

  easeWall(wall, cut, dt) {
    const target = cut ? WALL_CUT : 1
    if (wall.scale.y === target) return
    const next = wall.scale.y + (target - wall.scale.y) * Math.min(1, dt * WALL_SPEED)
    wall.scale.y = Math.abs(next - target) < 0.005 ? target : next
    for (const [owner, labels] of this.wallLabels) {
      if (owner === wall) labels.forEach(label => (label.visible = wall.scale.y > LABEL_MIN && !(this.far && this.smallLabels.includes(label))))
    }
  }
}

function shortName(pod, workload) {
  if (!pod.name.startsWith(`${workload.name}-`)) return pod.name
  const rest = pod.name.slice(workload.name.length + 1)
  return workload.kind === 'Deployment' ? rest.split('-').pop() : rest
}
