import * as THREE from 'three'
import { block, textPlane } from './primitives.js'
import { surface } from '../theme/materials.js'
import { hazardMaterial } from '../theme/textures.js'
import { palette } from '../theme/palette.js'

const RAIL_Y = 0.8
const SIGN_Y = 1.6

export class WorkloadPad extends THREE.Group {
  constructor(workload, width, depth, ns, fence = null) {
    super()
    const frame = block(width, 0.14, depth, hazardMaterial(width / 1.4, depth / 1.4), { radius: 0.05 })
    frame.position.y = 0.07
    const inner = block(width - 0.7, 0.2, depth - 0.7, surface(palette.padInner), { radius: 0.08 })
    inner.position.y = 0.1
    this.add(frame, inner)

    const boardWidth = Math.min(width - 0.6, 4.4)
    const sign = new THREE.Group()
    const board = block(boardWidth, 0.9, 0.14, surface(palette.dark), { radius: 0.06 })
    const name = textPlane(workload.name.toUpperCase(), 0.42, { color: palette.text, maxWidth: boardWidth - 0.3 })
    name.position.set(0, 0.12, 0.08)
    const kind = textPlane(`${workload.kind} ${workload.ready}/${workload.desired}`, 0.24, { color: '#b9a8e4', maxWidth: boardWidth - 0.3, weight: 500 })
    kind.position.set(0, -0.24, 0.08)
    sign.add(board, name, kind)
    sign.position.set(0, SIGN_Y, depth / 2 - 0.55)
    sign.rotation.x = -0.35

    for (const x of [-boardWidth / 2 + 0.3, boardWidth / 2 - 0.3]) {
      const leg = block(0.12, SIGN_Y - 0.15, 0.12, surface(palette.metal), { radius: 0.03 })
      leg.position.set(x, (SIGN_Y + 0.15) / 2, depth / 2 - 0.6)
      this.add(leg)
    }
    this.add(sign)
    if (fence) this.buildFence(width, depth, fence)
    this.userData.pick = { type: 'workload', id: workload.key, ns }
  }

  buildFence(width, depth, color) {
    const material = surface(color, { roughness: 0.4 })
    const inset = 0.2
    const w = width / 2 - inset
    const d = depth / 2 - inset
    for (const z of [-d, d]) {
      const rail = block(width - inset * 2, 0.1, 0.1, material, { radius: 0.03 })
      rail.position.set(0, RAIL_Y, z)
      this.add(rail)
    }
    for (const x of [-w, w]) {
      const rail = block(0.1, 0.1, depth - inset * 2, material, { radius: 0.03 })
      rail.position.set(x, RAIL_Y, 0)
      this.add(rail)
    }
    for (const x of [-w, w]) {
      for (const z of [-d, d]) {
        const post = block(0.14, RAIL_Y, 0.14, material, { radius: 0.03 })
        post.position.set(x, RAIL_Y / 2, z)
        this.add(post)
      }
    }
  }
}
