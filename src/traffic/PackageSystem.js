import * as THREE from 'three'
import { roundedBox } from '../objects/primitives.js'
import { surface } from '../theme/materials.js'

const BODY = roundedBox(0.8, 0.55, 0.62, 0.12)
const TAPE = roundedBox(0.2, 0.57, 0.64, 0.05)
const LIFT = 0.3
const MAX = 700
const GRAVITY = 22
const FALL_TIME = 1.4

const point = new THREE.Vector3()
const tangent = new THREE.Vector3()
const tapeColors = new Map()

function tapeColor(color) {
  if (!tapeColors.has(color)) tapeColors.set(color, new THREE.Color(color).multiplyScalar(0.84).getHex())
  return tapeColors.get(color)
}

class Parcel {
  constructor() {
    this.group = new THREE.Group()
    this.body = new THREE.Mesh(BODY)
    this.tape = new THREE.Mesh(TAPE)
    this.body.castShadow = this.tape.castShadow = true
    this.group.add(this.body, this.tape)
  }
}

export class PackageSystem {
  constructor(root) {
    this.root = root
    this.pool = []
    this.active = []
  }

  get count() {
    return this.active.length
  }

  spawn(path, { color, scale = 1, dropped = false, delay = 0, speed = 9, onArrive = null }) {
    if (this.active.length >= MAX) return false
    const p = this.pool.pop() ?? new Parcel()
    p.body.material = surface(color, { roughness: 0.5 })
    p.tape.material = surface(tapeColor(color), { roughness: 0.5 })
    Object.assign(p, { path, length: path.getLength(), u: 0, delay, speed, dropped, onArrive, falling: false, vy: 0, life: 0, scale })
    p.group.scale.setScalar(scale)
    p.group.rotation.set(0, 0, 0)
    p.group.visible = false
    this.root.add(p.group)
    this.active.push(p)
    return true
  }

  tick(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]
      if (p.delay > 0) {
        p.delay -= dt
        continue
      }
      p.group.visible = true

      if (p.falling) {
        p.vy -= GRAVITY * dt
        p.life += dt
        p.group.position.y += p.vy * dt
        p.group.rotation.x += dt * 5
        p.group.rotation.z += dt * 3
        p.group.scale.setScalar(p.scale * Math.max(0, 1 - p.life / FALL_TIME))
        if (p.life > FALL_TIME) this.release(i)
        continue
      }

      p.u += (p.speed * dt) / p.length
      if (p.dropped && p.u > 0.5) {
        p.falling = true
        p.vy = 4
        continue
      }
      if (p.u >= 1) {
        p.onArrive?.()
        this.release(i)
        continue
      }

      p.path.getPointAt(p.u, point)
      p.path.getTangentAt(p.u, tangent)
      p.group.position.copy(point)
      p.group.position.y += LIFT * p.scale
      if (tangent.x * tangent.x + tangent.z * tangent.z > 0.05) p.group.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI / 2
    }
  }

  release(i) {
    const p = this.active[i]
    this.active[i] = this.active[this.active.length - 1]
    this.active.pop()
    this.root.remove(p.group)
    p.path = null
    p.onArrive = null
    this.pool.push(p)
  }

  clear() {
    while (this.active.length) this.release(this.active.length - 1)
  }
}
