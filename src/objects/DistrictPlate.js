import * as THREE from 'three'
import { textPlane } from './primitives.js'
import { surface } from '../theme/materials.js'
import { palette, hex } from '../theme/palette.js'

const slabGeometry = new THREE.BoxGeometry(1, 1, 1)
const SLAB_TOP = -3.4
const SLAB_H = 1.2

export class DistrictPlate extends THREE.Group {
  constructor(name) {
    super()
    this.district = name
    this.slab = new THREE.Mesh(slabGeometry, surface(palette.district))
    this.slab.position.y = SLAB_TOP - SLAB_H / 2
    this.slab.receiveShadow = true
    this.slab.userData.noPick = true
    this.title = textPlane(name.toUpperCase(), 5, { color: hex(palette.districtText) })
    this.title.rotation.x = -Math.PI / 2
    this.title.position.y = SLAB_TOP + 0.03
    this.add(this.slab, this.title)
    this.from = { x: 0, z: 0, w: 1, d: 1 }
    this.to = { x: 0, z: 0, w: 1, d: 1 }
    this.fresh = true
  }

  target(x, z, w, d, labelZ) {
    this.from = { x: this.position.x, z: this.position.z, w: this.slab.scale.x, d: this.slab.scale.z }
    this.to = { x, z, w, d }
    this.labelZ = labelZ
    if (this.fresh) {
      this.from = { ...this.to }
      this.fresh = false
    }
    this.apply(0)
  }

  apply(k) {
    const lerp = THREE.MathUtils.lerp
    const w = lerp(this.from.w, this.to.w, k)
    const d = lerp(this.from.d, this.to.d, k)
    this.position.x = lerp(this.from.x, this.to.x, k)
    this.position.z = lerp(this.from.z, this.to.z, k)
    this.slab.scale.set(w, SLAB_H, d)
    this.title.position.z = d / 2 - this.labelZ
  }
}
