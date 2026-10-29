import * as THREE from 'three'
import { block, textPlane } from './primitives.js'
import { surface } from '../theme/materials.js'
import { hazardMaterial } from '../theme/textures.js'
import { palette } from '../theme/palette.js'

export class ServiceGate extends THREE.Group {
  constructor(service, ns) {
    super()
    for (const x of [-1.8, 1.8]) {
      const pillar = block(0.55, 3.4, 0.55, surface(palette.trim), { radius: 0.1 })
      pillar.position.set(x, 1.7, 0)
      const band = block(0.6, 0.5, 0.6, hazardMaterial(1, 1), { radius: 0.04 })
      band.position.set(x, 0.6, 0)
      const foot = block(0.9, 0.2, 0.9, surface(palette.metal), { radius: 0.06 })
      foot.position.set(x, 0.1, 0)
      this.add(pillar, band, foot)
    }
    const beam = block(4.5, 0.75, 0.8, surface(palette.dark), { radius: 0.12 })
    beam.position.y = 3.6
    const name = textPlane(service.name, 0.42, { color: palette.text, maxWidth: 4.1 })
    name.position.set(0, 3.62, 0.41)
    const ports = textPlane(service.ports.join('  '), 0.3, { color: palette.textDark, background: '#ece3fb', maxWidth: 3.2, weight: 600 })
    ports.position.set(0, 2.95, 0.3)
    this.add(beam, name, ports)
    this.userData.pick = { type: 'service', id: service.name, ns }
  }
}
