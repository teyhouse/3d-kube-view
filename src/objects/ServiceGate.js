import * as THREE from 'three'
import { block, textPlane } from './primitives.js'
import { surface, ownedSurface } from '../theme/materials.js'
import { hazardMaterial } from '../theme/textures.js'
import { palette } from '../theme/palette.js'

const PILLAR_H = 6.2

export class ServiceGate extends THREE.Group {
  constructor(service, ns) {
    super()
    for (const x of [-1.8, 1.8]) {
      const pillar = block(0.55, PILLAR_H, 0.55, surface(palette.trim), { radius: 0.1 })
      pillar.position.set(x, PILLAR_H / 2, 0)
      const band = block(0.6, 0.5, 0.6, hazardMaterial(1, 1), { radius: 0.04 })
      band.position.set(x, 0.6, 0)
      const foot = block(0.9, 0.2, 0.9, surface(palette.metal), { radius: 0.06 })
      foot.position.set(x, 0.1, 0)
      this.add(pillar, band, foot)
    }
    this.beamMaterial = ownedSurface(palette.dark, { emissive: palette.selected, emissiveIntensity: 0 })
    const beam = block(4.5, 0.75, 0.8, this.beamMaterial, { radius: 0.12 })
    beam.position.y = PILLAR_H + 0.2
    const name = textPlane(service.name, 0.42, { color: palette.text, maxWidth: 4.1 })
    name.position.set(0, PILLAR_H + 0.22, 0.41)
    const ports = textPlane(service.ports.join('  '), 0.3, { color: palette.textDark, background: '#ece3fb', maxWidth: 3.2, weight: 600 })
    ports.position.set(0, PILLAR_H - 0.45, 0.1)
    this.add(beam, name, ports)
    this.flash = 0
    this.userData.pick = { type: 'service', id: service.name, ns }
  }

  pulse() {
    this.flash = 1
  }

  tick(dt) {
    if (this.flash <= 0) return
    this.flash = Math.max(0, this.flash - dt * 2.5)
    this.beamMaterial.emissiveIntensity = this.flash * 0.9
  }
}
