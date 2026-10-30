import * as THREE from 'three'
import { block, textPlane } from './primitives.js'
import { Conveyor } from './Conveyor.js'
import { ServiceGate } from './ServiceGate.js'
import { BELT_Y } from './NamespaceRoom.js'
import { surface } from '../theme/materials.js'
import { palette, hex } from '../theme/palette.js'

const BAY_WIDTH = 9
const DEPTH = 9
const WALL_H = 9
const WALL_T = 0.8
const MIN_WIDTH = 20

export class LoadingDock extends THREE.Group {
  constructor(entries) {
    super()
    this.namespace = 'loading-dock'
    this.entries = new Map(entries.map(entry => [entry.id, entry]))
    this.pods = new Map(entries.flatMap(entry => entry.pods.map(pod => [`${entry.ns}/${pod}`, entry.id])))
    this.gates = new Map()
    this.home = new THREE.Vector3()
    this.from = new THREE.Vector3()
    this.width = Math.max(MIN_WIDTH, entries.length * BAY_WIDTH + 4)
    this.signature = JSON.stringify(entries)
    this.build(entries)
  }

  build(entries) {
    const W = this.width
    const slab = block(W, 2.4, DEPTH, surface(palette.dock), { radius: 0.3, shared: false })
    slab.position.y = -1.2
    const wall = block(W, WALL_H, WALL_T, surface(palette.dockWall), { radius: 0.25, shared: false })
    wall.position.set(0, WALL_H / 2, -DEPTH / 2 + WALL_T / 2)
    const title = textPlane('LOADING DOCK', 1.3, { color: hex(palette.dock), maxWidth: W * 0.7 })
    title.position.set(0, WALL_H - 1.1, -DEPTH / 2 + WALL_T + 0.02)
    this.add(slab, wall, title)

    entries.forEach((entry, i) => {
      const x = (i - (entries.length - 1) / 2) * BAY_WIDTH
      const frame = block(3.4, 2.6, WALL_T + 0.3, surface(palette.trim), { radius: 0.25 })
      frame.position.set(x, BELT_Y - 0.1, -DEPTH / 2 + WALL_T / 2)
      const hole = block(2.7, 1.9, WALL_T + 0.42, surface(palette.hole, { roughness: 1 }), { radius: 0.2 })
      hole.position.copy(frame.position)
      const gate = new ServiceGate({ name: entry.workload, ports: [entry.kind] }, entry.ns)
      gate.position.set(x, 0, DEPTH / 2 - 1)
      gate.userData.pick = { type: 'bay', id: entry.id }
      const belt = new Conveyor(new THREE.Vector3(x, BELT_Y, -DEPTH / 2 + WALL_T), new THREE.Vector3(x, BELT_Y, DEPTH / 2), [DEPTH / 2])
      this.add(frame, hole, belt, gate)
      this.gates.set(entry.id, { gate, x })
    })

    for (const [x, z, size] of [[-W / 2 + 2, DEPTH / 2 - 1.6, 1.4], [-W / 2 + 3.6, DEPTH / 2 - 1.2, 1], [W / 2 - 2.2, -0.4, 1.3]]) {
      const crate = block(size, size * 0.8, size, surface(palette.crate), { radius: 0.1 })
      crate.position.set(x, (size * 0.8) / 2, z)
      this.add(crate)
    }
  }

  bayFor(ns, pod) {
    return this.pods.get(`${ns}/${pod}`) ?? null
  }

  insideLocal(id) {
    return new THREE.Vector3(this.gates.get(id).x, BELT_Y, DEPTH / 2 + 0.6)
  }

  outsideLocal(id) {
    return new THREE.Vector3(this.gates.get(id).x, BELT_Y, -DEPTH / 2 - 0.6)
  }

  anchor(id, side) {
    if (!this.gates.has(id)) return null
    return (side === 'in' ? this.insideLocal(id) : this.outsideLocal(id)).add(this.home)
  }

  pulse(id) {
    this.gates.get(id)?.gate.pulse()
  }

  describe(id) {
    const entry = this.entries.get(id)
    if (!entry) return null
    return {
      title: entry.workload,
      subtitle: `Entry point in ${entry.ns}`,
      rows: [
        ['Kind', entry.kind],
        ['Pods', entry.pods.length]
      ],
      sections: [{ title: 'Hosts', items: entry.hosts }]
    }
  }

  tick(dt) {
    for (const { gate } of this.gates.values()) gate.tick(dt)
  }
}

export const DOCK_DEPTH = DEPTH
