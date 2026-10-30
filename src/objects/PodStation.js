import * as THREE from 'three'
import { block, textPlane } from './primitives.js'
import { surface, ownedSurface } from '../theme/materials.js'
import { hazardMaterial } from '../theme/textures.js'
import { palette } from '../theme/palette.js'

const SINK_DEPTH = 5

export class PodStation extends THREE.Group {
  constructor(pod, label) {
    super()
    this.podName = pod.name
    const containers = Math.min(Math.max(pod.containers.length, 1), 3)
    this.bodyHeight = 1.3 + containers * 0.45

    this.bodyMaterial = ownedSurface(statusColor(pod), { roughness: 0.55 })
    this.lampMaterial = ownedSurface(palette.lamp, { emissive: palette.lamp, emissiveIntensity: 0.5 })
    this.flash = 0
    this.bump = 0
    this.home = new THREE.Vector3()
    this.rise = 0
    this.riseSpeed = 0
    this.shaking = 0
    this.glide = null
    this.done = false

    const base = block(2.4, 0.35, 2.4, surface(palette.metal))
    base.position.y = 0.175
    const band = block(1.9, 0.35, 1.9, hazardMaterial(3, 1), { radius: 0.04 })
    band.position.y = 0.525
    this.body = new THREE.Group()
    this.body.position.y = 0.7
    const shell = block(1.7, this.bodyHeight, 1.7, this.bodyMaterial, { radius: 0.22 })
    shell.position.y = this.bodyHeight / 2
    this.body.add(shell)

    for (let i = 1; i < containers; i++) {
      const seam = block(1.76, 0.08, 1.76, surface(palette.metal), { radius: 0.03 })
      seam.position.y = (this.bodyHeight / containers) * i
      this.body.add(seam)
    }

    const housing = block(0.95, 0.35, 0.95, surface(palette.dark), { radius: 0.1 })
    housing.position.y = this.bodyHeight + 0.175
    const lamp = block(0.65, 0.14, 0.65, this.lampMaterial, { radius: 0.05, shadow: false })
    lamp.position.y = this.bodyHeight + 0.4
    this.body.add(housing, lamp)

    const plate = textPlane(label, 0.38, { color: palette.textDark, maxWidth: 1.5 })
    plate.position.set(0, this.bodyHeight * 0.55, 0.86)
    this.body.add(plate)

    this.add(base, band, this.body)
    this.topY = 0.7 + this.bodyHeight + 0.47
    this.userData.pick = { type: 'pod', id: pod.name, ns: pod.namespace }
  }

  place(x, y, z) {
    this.home.set(x, y, z)
    this.position.copy(this.home)
  }

  enter() {
    this.rise = 1
    this.riseSpeed = -0.8
    this.position.y = this.home.y - SINK_DEPTH
  }

  exit() {
    this.riseSpeed = 0.9
    this.userData.pick = null
  }

  shake() {
    this.shaking = 1
  }

  glideFrom(position) {
    if (position.distanceToSquared(this.home) < 0.0001) return
    this.glide = { from: position.clone(), t: 0 }
  }

  pulse(color) {
    this.flash = 1
    this.lampMaterial.emissive.set(color)
  }

  receive() {
    this.bump = Math.min(this.bump + 0.35, 1)
  }

  tick(dt) {
    this.position.copy(this.home)
    if (this.glide) {
      this.glide.t = Math.min(1, this.glide.t + dt / 0.7)
      this.position.lerpVectors(this.glide.from, this.home, this.glide.t * this.glide.t * (3 - 2 * this.glide.t))
      if (this.glide.t === 1) this.glide = null
    }
    if (this.riseSpeed !== 0) {
      this.rise = Math.min(1, Math.max(0, this.rise + this.riseSpeed * dt))
      if (this.rise === 0) this.riseSpeed = 0
      if (this.rise === 1 && this.riseSpeed > 0) this.done = true
    }
    this.position.y -= this.rise * SINK_DEPTH
    if (this.shaking > 0) {
      this.shaking = Math.max(0, this.shaking - dt * 1.1)
      this.position.x += Math.sin(this.shaking * 60) * 0.1 * this.shaking
      this.position.z += Math.cos(this.shaking * 47) * 0.1 * this.shaking
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 1.6)
      this.lampMaterial.emissiveIntensity = 0.5 + this.flash * 5
      if (this.flash === 0) this.lampMaterial.emissive.set(palette.lamp)
    }
    if (this.bump > 0) {
      this.bump = Math.max(0, this.bump - dt * 3)
      this.body.scale.y = 1 - Math.sin(this.bump * Math.PI) * 0.06
    }
  }
}

function statusColor(pod) {
  if (pod.phase === 'Running' && !pod.ready) return palette.status.NotReady
  return palette.status[pod.phase] ?? palette.status.Unknown
}
