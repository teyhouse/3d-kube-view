import * as THREE from 'three'

const INTERVAL = 0.4

export class LightPool {
  constructor(scene, count = 4) {
    this.lights = Array.from({ length: count }, () => {
      const light = new THREE.PointLight(0xffd6b0, 0, 40, 2)
      scene.add(light)
      return light
    })
    this.elapsed = INTERVAL
  }

  update(dt, rooms, target) {
    this.elapsed += dt
    if (this.elapsed < INTERVAL) return
    this.elapsed = 0
    const nearest = rooms
      .map(room => ({ position: room.lampWorld(), room }))
      .sort((a, b) => a.position.distanceToSquared(target) - b.position.distanceToSquared(target))
    this.lights.forEach((light, i) => {
      const slot = nearest[i]
      light.intensity = slot ? 90 : 0
      if (slot) light.position.copy(slot.position)
    })
  }
}
