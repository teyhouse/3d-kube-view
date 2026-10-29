import * as THREE from 'three'
import { block, textPlane } from './primitives.js'
import { surface } from '../theme/materials.js'
import { hazardMaterial } from '../theme/textures.js'
import { palette } from '../theme/palette.js'

export class WorkloadPad extends THREE.Group {
  constructor(workload, width, depth, ns) {
    super()
    const frame = block(width, 0.14, depth, hazardMaterial(width / 1.4, depth / 1.4), { radius: 0.05, shared: false })
    frame.position.y = 0.07
    const inner = block(width - 0.7, 0.2, depth - 0.7, surface(palette.padInner), { radius: 0.08, shared: false })
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
    sign.position.set(0, 0.95, depth / 2 - 0.55)
    sign.rotation.x = -0.35

    for (const x of [-boardWidth / 2 + 0.3, boardWidth / 2 - 0.3]) {
      const leg = block(0.12, 0.6, 0.12, surface(palette.metal), { radius: 0.03 })
      leg.position.set(x, 0.45, depth / 2 - 0.6)
      this.add(leg)
    }
    this.add(sign)
    this.userData.pick = { type: 'workload', id: workload.key, ns }
  }
}
