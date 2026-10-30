import * as THREE from 'three'
import { palette } from '../theme/palette.js'

const geometry = new THREE.RingGeometry(0.94, 1, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2)
const HALF_SIDE = Math.SQRT1_2
const MARGIN = 0.5
const box = new THREE.Box3()
const size = new THREE.Vector3()
const origin = new THREE.Vector3()

function createRing(color) {
  const ring = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }))
  ring.raycast = () => {}
  ring.userData.noPick = true
  ring.visible = false
  return ring
}

function isAttached(object) {
  let node = object
  while (node.parent) node = node.parent
  return node.isScene === true
}

export class Highlighter {
  constructor() {
    this.hoverRing = createRing(palette.hover)
    this.hoverRing.material.opacity = 0.65
    this.selectRing = createRing(palette.selected)
    this.hovered = null
    this.selected = null
  }

  attach(ring, object) {
    ring.removeFromParent()
    ring.visible = false
    if (!object) return
    object.getWorldPosition(origin)
    const known = object.userData.bounds
    if (known) {
      size.copy(known.size)
      ring.position.set(known.center.x, Math.max(known.bottom, 0) + 0.06, known.center.z)
    } else {
      box.setFromObject(object)
      box.getSize(size)
      ring.position.set(box.min.x + size.x / 2 - origin.x, Math.max(box.min.y - origin.y, 0) + 0.06, box.min.z + size.z / 2 - origin.z)
    }
    ring.scale.set((size.x / 2 + MARGIN) / HALF_SIDE, 1, (size.z / 2 + MARGIN) / HALF_SIDE)
    ring.visible = true
    object.add(ring)
  }

  hover(object) {
    if (object === this.hovered) return
    this.hovered = object
    this.attach(this.hoverRing, object === this.selected ? null : object)
  }

  select(object) {
    if (object === this.selected) return
    this.selected = object
    this.attach(this.selectRing, object)
    this.attach(this.hoverRing, this.hovered === object ? null : this.hovered)
  }

  tick(time) {
    if (this.selected && !isAttached(this.selected)) this.select(null)
    if (this.hovered && !isAttached(this.hovered)) this.hover(null)
    this.selectRing.material.opacity = 0.7 + Math.sin(time * 4) * 0.3
  }
}
