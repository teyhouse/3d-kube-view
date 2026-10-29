import * as THREE from 'three'
import { block, textPlane } from './primitives.js'
import { surface, ownedSurface } from '../theme/materials.js'
import { hazardMaterial } from '../theme/textures.js'
import { palette } from '../theme/palette.js'

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

  pulse(color) {
    this.flash = 1
    this.lampMaterial.emissive.set(color)
  }

  receive() {
    this.bump = Math.min(this.bump + 0.35, 1)
  }

  tick(dt) {
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
