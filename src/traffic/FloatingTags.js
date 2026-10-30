import * as THREE from 'three'
import { labelTexture } from '../theme/textures.js'
import { hex } from '../theme/palette.js'

const MAX_TAGS = 70
const MAX_TEXTURES = 200

export class FloatingTags {
  constructor(root) {
    this.root = root
    this.tags = []
    this.textures = new Map()
  }

  add(text, color, position, { ns = null, life = 2.4, size = 0.75 } = {}) {
    if (!text || this.tags.length >= MAX_TAGS) return
    const { texture, aspect } = this.texture(text, color)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
    sprite.scale.set(size * aspect, size, 1)
    sprite.position.copy(position)
    sprite.position.x += (Math.random() - 0.5) * 0.8
    sprite.position.y += 0.7
    sprite.position.z += (Math.random() - 0.5) * 0.8
    this.root.add(sprite)
    this.tags.push({ sprite, age: 0, life, ns })
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
        if (!this.tags.some(tag => tag.sprite.material.map === old.texture)) {
          old.texture.dispose()
          this.textures.delete(oldKey)
        }
      }
    }
    this.textures.set(key, entry)
    return entry
  }

  forget(namespaces) {
    if (!namespaces.length) return
    const gone = new Set(namespaces)
    for (const tag of this.tags) {
      if (gone.has(tag.ns)) tag.age = tag.life
    }
  }

  tick(dt) {
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const tag = this.tags[i]
      tag.age += dt
      tag.sprite.position.y += dt * 1.3
      tag.sprite.material.opacity = 1 - (tag.age / tag.life) ** 2
      if (tag.age < tag.life) continue
      this.root.remove(tag.sprite)
      tag.sprite.material.dispose()
      this.tags.splice(i, 1)
    }
  }
}
