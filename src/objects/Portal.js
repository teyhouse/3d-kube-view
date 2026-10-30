import * as THREE from 'three'
import { block, textSprite } from './primitives.js'
import { surface, ownedSurface } from '../theme/materials.js'
import { palette } from '../theme/palette.js'

const builders = {
  world(group) {
    const geometry = new THREE.IcosahedronGeometry(2.6, 1)
    geometry.userData.owned = true
    const globe = new THREE.Mesh(geometry, ownedSurface(palette.world, { flatShading: true, roughness: 0.7 }))
    const ringGeometry = new THREE.TorusGeometry(3.7, 0.18, 12, 64)
    ringGeometry.userData.owned = true
    const ring = new THREE.Mesh(ringGeometry, surface(palette.ring))
    ring.rotation.x = Math.PI / 2.4
    globe.castShadow = ring.castShadow = true
    group.add(globe, ring)
    return { spin: globe, label: 'INTERNET', labelY: -4.4 }
  },
  host(group) {
    const rack = block(3, 4.6, 2.4, surface(palette.dark), { radius: 0.25 })
    group.add(rack)
    for (let i = 0; i < 4; i++) {
      const slot = block(2.5, 0.75, 0.12, surface(palette.wallDark), { radius: 0.05 })
      slot.position.set(0, 1.5 - i * 1.0, 1.2)
      const led = block(0.22, 0.22, 0.1, surface(palette.led, { emissive: palette.led, emissiveIntensity: 1.5 }), { radius: 0.04, shadow: false })
      led.position.set(0.9, 1.5 - i * 1.0, 1.28)
      group.add(slot, led)
    }
    return { label: 'NODE / HOST', labelY: -3.4 }
  },
  namespace(group, name) {
    const slab = block(5, 1.2, 5, surface(palette.floor), { radius: 0.2 })
    slab.position.y = -1.4
    const back = block(5, 3.4, 0.4, surface(palette.wallDark), { radius: 0.12 })
    back.position.set(0, 0.9, -2.3)
    const left = block(0.4, 3.8, 5, surface(palette.wallLight), { radius: 0.12 })
    left.position.set(-2.3, 1.1, 0)
    const crate = block(1.2, 0.9, 1, surface(0xf0a98a), { radius: 0.12 })
    crate.position.set(0.6, -0.35, 0.4)
    group.add(slab, back, left, crate)
    return { label: name, labelY: -2.9 }
  }
}

export class Portal extends THREE.Group {
  constructor(id, kind, name) {
    super()
    this.portalId = id
    this.kind = kind
    this.ns = kind === 'namespace' ? name : null
    this.body = new THREE.Group()
    this.add(this.body)
    const { spin, label, labelY } = builders[kind](this.body, name)
    this.spin = spin
    const sprite = textSprite(label, 1.1, { color: palette.text, background: '#2a2150', weight: 600 })
    sprite.position.y = labelY
    this.add(sprite)
    this.home = new THREE.Vector3()
    this.from = new THREE.Vector3()
    this.appear = 0
    this.scale.setScalar(0.01)
    this.phase = Math.random() * Math.PI * 2
    this.flash = 0
    this.userData.pick = { type: 'portal', id, kind, name }
  }

  pulse() {
    this.flash = 1
  }

  tick(dt, time) {
    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt * 2)
      this.scale.setScalar(Math.max(0.01, this.appear * (2 - this.appear)))
    }
    this.body.position.y = Math.sin(time * 1.1 + this.phase) * 0.35
    if (this.spin) this.spin.rotation.y += dt * 0.25
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2)
      this.body.scale.setScalar(1 + Math.sin(this.flash * Math.PI) * 0.05)
    }
  }
}
