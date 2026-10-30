import * as THREE from 'three'
import { roundedBox } from '../objects/primitives.js'

const BODY = roundedBox(0.8, 0.55, 0.62, 0.12, 1)
const TAPE = new THREE.BoxGeometry(0.2, 0.57, 0.64)
const LIFT = 0.3
const CAPACITY = 3000
const GRAVITY = 22
const FALL_TIME = 1.4
const VANISH_TIME = 0.35
const POP_TIME = 0.14
const MAX_TRANSIT = 6

const point = new THREE.Vector3()
const dummy = new THREE.Object3D()
const colors = new Map()

function colorOf(hex) {
  if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex))
  return colors.get(hex)
}

export class PackageSystem {
  constructor(root) {
    this.active = []
    this.pool = []
    const matrices = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 16), 16)
    const tints = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3)
    matrices.setUsage(THREE.DynamicDrawUsage)
    tints.setUsage(THREE.DynamicDrawUsage)
    this.bodies = new THREE.InstancedMesh(BODY, new THREE.MeshStandardMaterial({ roughness: 0.5 }), CAPACITY)
    this.tapes = new THREE.InstancedMesh(TAPE, new THREE.MeshStandardMaterial({ color: 0xd6d6d6, roughness: 0.5 }), CAPACITY)
    for (const mesh of [this.bodies, this.tapes]) {
      mesh.instanceMatrix = matrices
      mesh.instanceColor = tints
      mesh.count = 0
      mesh.frustumCulled = false
      mesh.castShadow = true
      root.add(mesh)
    }
  }

  get count() {
    return this.active.length
  }

  spawn(route, { color, scale = 1, dropped = false, delay = 0, speed = 9 }) {
    if (this.active.length >= CAPACITY) return false
    const p = this.pool.pop() ?? { position: new THREE.Vector3(), rotation: new THREE.Euler() }
    Object.assign(p, { route, u: 0, leg: 0, delay, speed, dropped, color: colorOf(color), scale, state: 'move', vy: 0, life: 0, age: 0, placed: false })
    p.rotation.set(0, 0, 0)
    this.active.push(p)
    return true
  }

  clear() {
    this.pool.push(...this.active)
    this.active.length = 0
  }

  retarget(remaps) {
    if (!remaps.size) return
    for (const p of this.active) {
      const remap = remaps.get(p.route)
      if (!remap) continue
      if (remap.vanish) {
        p.state = 'vanish'
        p.life = 0
        continue
      }
      p.u = remap.map(p.u)
      p.leg = p.route.path.sample(p.u, point)
    }
  }

  setShadows(enabled) {
    this.bodies.castShadow = enabled
    this.tapes.castShadow = enabled
  }

  tick(dt, frustum) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.advance(this.active[i], dt)) continue
      this.pool.push(this.active[i])
      this.active[i] = this.active[this.active.length - 1]
      this.active.pop()
    }

    let n = 0
    for (const p of this.active) {
      if (!p.placed || p.route.path.legs[p.leg]?.room?.far || !frustum.containsPoint(p.position)) continue
      dummy.position.copy(p.position)
      dummy.rotation.copy(p.rotation)
      dummy.scale.setScalar(this.visualScale(p))
      dummy.updateMatrix()
      this.bodies.setMatrixAt(n, dummy.matrix)
      this.bodies.setColorAt(n, p.color)
      n++
    }
    this.bodies.count = n
    this.tapes.count = n
    this.bodies.instanceMatrix.needsUpdate = true
    this.bodies.instanceColor.needsUpdate = true
  }

  visualScale(p) {
    if (p.state === 'fall') return p.scale * Math.max(0.001, 1 - p.life / FALL_TIME)
    if (p.state === 'vanish') return p.scale * Math.max(0.001, 1 - p.life / VANISH_TIME)
    return p.scale * Math.min(1, p.age / POP_TIME)
  }

  advance(p, dt) {
    if (p.delay > 0) {
      p.delay -= dt
      return true
    }
    p.age += dt

    if (p.state === 'fall') {
      p.vy -= GRAVITY * dt
      p.life += dt
      p.position.y += p.vy * dt
      p.rotation.x += dt * 5
      p.rotation.z += dt * 3
      return p.life <= FALL_TIME
    }
    if (p.state === 'vanish') {
      p.life += dt
      return p.life <= VANISH_TIME
    }

    const path = p.route.path
    p.u += (Math.max(p.speed, path.length / MAX_TRANSIT) * path.legs[p.leg].pace * dt) / path.length
    if (p.dropped && p.u > 0.5) {
      p.state = 'fall'
      p.vy = 4
      return true
    }
    if (p.u >= 1) {
      p.route.onArrive?.()
      return false
    }

    const leg = path.sample(p.u, point)
    if (leg !== p.leg) {
      p.leg = leg
      path.legs[leg].onEnter?.()
    }
    point.y += LIFT * p.scale
    const dx = point.x - p.position.x
    const dz = point.z - p.position.z
    if (p.placed && dx * dx + dz * dz > 1e-5) p.rotation.y = Math.atan2(dx, dz) + Math.PI / 2
    p.position.copy(point)
    p.placed = true
    return true
  }
}
