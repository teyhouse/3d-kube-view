import * as THREE from 'three'
import { labelTexture } from '../theme/textures.js'
import { palette, hex } from '../theme/palette.js'

const LIFE = 2.4
const MAX_SPRITES = 60
const MAX_TEXTURES = 200

export class ProcessFx {
  constructor(world, root) {
    this.world = world
    this.root = root
    this.sprites = []
    this.textures = new Map()
    this.counter = 0
  }

  handle(events) {
    for (const event of events) {
      this.counter++
      const room = this.world.rooms.get(event.ns)
      const station = room?.stations.get(event.pod)
      if (!station) continue
      const color = palette.process[event.type] ?? palette.process.other
      station.pulse(color)
      if (event.type === 'exit' || this.sprites.length >= MAX_SPRITES) continue
      const text = event.type === 'exec' ? event.binary.split('/').pop() : event.fn ?? event.type
      const { texture, aspect } = this.texture(text, color)
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
      sprite.scale.set(0.75 * aspect, 0.75, 1)
      sprite.position.copy(room.portWorld(event.pod)).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.7, (Math.random() - 0.5) * 0.8))
      this.root.add(sprite)
      this.sprites.push({ sprite, life: 0 })
    }
  }

  texture(text, color) {
    const key = `${text}:${color}`
    let entry = this.textures.get(key)
    if (entry) {
      this.textures.delete(key)
    } else {
      entry = labelTexture(text, { color: hex(color), background: '#2a2150', size: 64, weight: 600 })
      if (this.textures.size >= MAX_TEXTURES) {
        const [oldKey, old] = this.textures.entries().next().value
        if (!this.sprites.some(s => s.sprite.material.map === old.texture)) {
          old.texture.dispose()
          this.textures.delete(oldKey)
        }
      }
    }
    this.textures.set(key, entry)
    return entry
  }

  tick(dt) {
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i]
      s.life += dt
      s.sprite.position.y += dt * 1.3
      s.sprite.material.opacity = 1 - (s.life / LIFE) ** 2
      if (s.life < LIFE) continue
      this.root.remove(s.sprite)
      s.sprite.material.dispose()
      this.sprites.splice(i, 1)
    }
  }
}
