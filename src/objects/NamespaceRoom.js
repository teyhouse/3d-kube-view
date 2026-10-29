import * as THREE from 'three'
import { block, textPlane } from './primitives.js'
import { PodStation } from './PodStation.js'
import { WorkloadPad } from './WorkloadPad.js'
import { ServiceGate } from './ServiceGate.js'
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

    const plan = this.plan()
    this.width = plan.width
    this.depth = plan.depth
    this.hatchX = -this.width / 2 + WALL_T + 4.5

    this.buildShell()
    this.buildContent(plan)
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

    this.add(floor, back, left, number, title, sideLabel, trafficLabel, hatchFrame, hatchHole)
  }

  buildContent({ items }) {
    for (const item of items) {
      const pad = new WorkloadPad(item.workload, item.w, item.d, this.namespace)
      pad.position.set(item.cx, 0, item.cz)
      this.add(pad)
      item.pods.forEach((pod, i) => {
        const col = i % item.cols
        const row = Math.floor(i / item.cols)
        const station = new PodStation({ ...pod, namespace: this.namespace }, shortName(pod, item.workload))
        station.position.set(item.cx - item.w / 2 + 0.5 + CELL * (col + 0.5), 0.2, item.cz - item.d / 2 + 0.4 + CELL * (row + 0.5))
        this.add(station)
        this.stations.set(pod.name, station)
      })
    }

    const services = this.data.services
    services.forEach((service, i) => {
      const gate = new ServiceGate(service, this.namespace)
      gate.position.set((i - (services.length - 1) / 2) * GATE_SPACING, 0, this.depth / 2 - 3.2)
      this.add(gate)
    })
  }

  portLocal(key) {
    if (key === HATCH) return new THREE.Vector3(this.hatchX, BELT_Y, -this.depth / 2 + WALL_T + 1.2)
    const station = this.stations.get(key)
    return station.position.clone().setY(station.position.y + station.topY)
  }

  portWorld(key) {
    return this.portLocal(key).add(this.position)
  }

  beltWorld(key) {
    return this.portWorld(key).setY(BELT_Y)
  }

  hatchOutside() {
    return new THREE.Vector3(this.hatchX, BELT_Y, -this.depth / 2 - 0.6).add(this.position)
  }

  lampWorld() {
    return new THREE.Vector3(-this.width / 4, 8, -this.depth / 4).add(this.position)
  }

  bounds() {
    const box = new THREE.Box3(new THREE.Vector3(-this.width / 2, -3, -this.depth / 2), new THREE.Vector3(this.width / 2, WALL_H, this.depth / 2))
    return box.translate(this.position)
  }

  tick(dt) {
    for (const station of this.stations.values()) station.tick(dt)
  }
}

function shortName(pod, workload) {
  if (!pod.name.startsWith(`${workload.name}-`)) return pod.name
  const rest = pod.name.slice(workload.name.length + 1)
  return workload.kind === 'Deployment' ? rest.split('-').pop() : rest
}
