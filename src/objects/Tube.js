import * as THREE from 'three'
import { palette } from '../theme/palette.js'

const material = new THREE.MeshStandardMaterial({
  color: palette.tube,
  roughness: 0.15,
  transparent: true,
  opacity: 0.22,
  depthWrite: false
})
const ringMaterial = new THREE.MeshStandardMaterial({ color: palette.metal, roughness: 0.5 })
const ring = new THREE.TorusGeometry(0.62, 0.14, 10, 28)

export class Tube extends THREE.Group {
  constructor(a, b) {
    super()
    const distance = a.distanceTo(b)
    const lift = Math.max(5, distance * 0.3)
    const c1 = a.clone().add(new THREE.Vector3(0, lift, -lift * 0.5))
    const c2 = b.clone().add(new THREE.Vector3(0, lift, 0))
    this.curve = new THREE.CubicBezierCurve3(a.clone(), c1, c2, b.clone())
    this.reverse = new THREE.CubicBezierCurve3(b.clone(), c2, c1, a.clone())

    const geometry = new THREE.TubeGeometry(this.curve, 64, 0.55, 12, false)
    geometry.userData.owned = true
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = 2
    this.add(mesh)

    for (const [point, t] of [[a, 0.001], [b, 0.999]]) {
      const cap = new THREE.Mesh(ring, ringMaterial)
      cap.position.copy(point)
      cap.lookAt(this.curve.getPointAt(t === 0.001 ? 0.03 : 0.97))
      cap.castShadow = true
      this.add(cap)
    }
    this.userData.noPick = true
  }
}
