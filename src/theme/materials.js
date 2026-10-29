import * as THREE from 'three'

const cache = new Map()

export function surface(color, { roughness = 0.62, metalness = 0, emissive = 0x000000, emissiveIntensity = 0 } = {}) {
  const key = `${color}:${roughness}:${metalness}:${emissive}:${emissiveIntensity}`
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity }))
  }
  return cache.get(key)
}

export function ownedSurface(color, options = {}) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...options })
  material.userData.owned = true
  return material
}
