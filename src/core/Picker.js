import * as THREE from 'three'

function isShown(object) {
  for (let node = object; node; node = node.parent) {
    if (!node.visible) return false
  }
  return true
}

export class Picker {
  constructor(camera, dom, root) {
    this.camera = camera
    this.dom = dom
    this.root = root
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.client = { x: 0, y: 0 }
    this.dirty = false
    this.inside = false
    this.down = null
    this.onHover = () => {}
    this.onSelect = () => {}
    this.onFocus = () => {}

    dom.addEventListener('pointermove', e => {
      this.setPointer(e)
      this.inside = true
      this.dirty = true
    })
    dom.addEventListener('pointerleave', () => {
      this.inside = false
      this.onHover(null)
    })
    dom.addEventListener('pointerdown', e => (this.down = { x: e.clientX, y: e.clientY }))
    dom.addEventListener('pointerup', e => {
      if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5) {
        this.setPointer(e)
        this.onSelect(this.pick())
      }
      this.down = null
    })
    dom.addEventListener('dblclick', e => {
      this.setPointer(e)
      this.onFocus(this.pick())
    })
  }

  setPointer(e) {
    const rect = this.dom.getBoundingClientRect()
    this.client = { x: e.clientX, y: e.clientY }
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
  }

  pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    for (const hit of this.raycaster.intersectObject(this.root, true)) {
      if (hit.object.userData.noPick || !isShown(hit.object)) continue
      let o = hit.object.userData.instancePicks?.[hit.instanceId] ?? hit.object
      while (o && !o.userData.pick) o = o.parent
      if (o) return { ...o.userData.pick, object: o }
    }
    return null
  }

  update() {
    if (!this.dirty || !this.inside || this.down) return
    this.dirty = false
    this.onHover(this.pick(), this.client)
  }
}
