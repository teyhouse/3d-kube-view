import * as THREE from 'three'
import { block } from './primitives.js'
import { surface } from '../theme/materials.js'
import { hazardMaterial, rollerTexture } from '../theme/textures.js'
import { palette } from '../theme/palette.js'

const roller = new THREE.CylinderGeometry(0.13, 0.13, 1, 12).rotateX(Math.PI / 2)
const SPACING = 0.42
const ROLL_SPEED = 1.8

let rollerMaterial = null

function rollers() {
  rollerMaterial ??= new THREE.MeshStandardMaterial({ map: rollerTexture(), roughness: 0.45 })
  return rollerMaterial
}

export function tickRollers(dt) {
  if (rollerMaterial) rollerMaterial.map.offset.x = (rollerMaterial.map.offset.x + dt * ROLL_SPEED) % 1
}

export class Conveyor extends THREE.Group {
  constructor(a, b, pillars = []) {
    super()
    const dir = new THREE.Vector3().subVectors(b, a)
    const length = Math.max(dir.length(), 0.5)
    this.position.copy(a).add(b).multiplyScalar(0.5)
    this.rotation.y = -Math.atan2(dir.z, dir.x)

    const frame = block(length + 0.6, 0.3, 1.25, surface(palette.trim), { radius: 0.1, shared: false })
    frame.position.y = -0.4
    this.add(frame)

    for (const z of [-0.6, 0.6]) {
      const rail = block(length + 0.6, 0.18, 0.12, surface(palette.metal), { radius: 0.04, shared: false })
      rail.position.set(0, -0.12, z)
      this.add(rail)
    }

    const count = Math.max(1, Math.floor(length / SPACING))
    const mesh = new THREE.InstancedMesh(roller, rollers(), count)
    const m = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      m.makeTranslation(-length / 2 + SPACING * (i + 0.5) + (length - count * SPACING) / 2, -0.15, 0)
      mesh.setMatrixAt(i, m)
    }
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.add(mesh)

    const height = a.y - 0.55
    for (const offset of pillars) {
      const x = offset - length / 2
      const pillar = block(0.45, height, 0.45, surface(palette.trim), { radius: 0.08 })
      pillar.position.set(x, -0.55 - height / 2, 0)
      const band = block(0.5, 0.5, 0.5, hazardMaterial(1, 1), { radius: 0.04 })
      band.position.set(x, -a.y + 0.45, 0)
      this.add(pillar, band)
    }
  }
}
