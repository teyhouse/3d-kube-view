import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { labelTexture } from '../theme/textures.js'

const geometries = new Map()
const plane = new THREE.PlaneGeometry(1, 1)

function createRounded(w, h, d, radius, segments) {
  const r = Math.max(0.001, Math.min(radius, Math.min(w, h, d) / 2 - 0.001))
  return new RoundedBoxGeometry(w, h, d, segments, r)
}

export function roundedBox(w, h, d, radius = 0.12, segments = 3) {
  const key = `${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${radius}:${segments}`
  if (!geometries.has(key)) geometries.set(key, createRounded(w, h, d, radius, segments))
  return geometries.get(key)
}

export function block(w, h, d, material, { radius = 0.12, segments = 3, shared = true, shadow = true } = {}) {
  let geometry
  if (shared) {
    geometry = roundedBox(w, h, d, radius, segments)
  } else {
    geometry = createRounded(w, h, d, radius, segments)
    geometry.userData.owned = true
  }
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  return mesh
}

export function textPlane(text, height, { maxWidth = Infinity, lit = true, ...style } = {}) {
  const { texture, aspect } = labelTexture(text, style)
  let w = height * aspect
  let h = height
  if (w > maxWidth) {
    h *= maxWidth / w
    w = maxWidth
  }
  const Material = lit ? THREE.MeshStandardMaterial : THREE.MeshBasicMaterial
  const material = new Material({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
  if (lit) material.roughness = 0.8
  else material.toneMapped = false
  material.userData.owned = true
  material.userData.ownsMap = true
  const mesh = new THREE.Mesh(plane, material)
  mesh.scale.set(w, h, 1)
  mesh.userData.noPick = true
  return mesh
}

export function textSprite(text, height, style) {
  const { texture, aspect } = labelTexture(text, style)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
  material.userData.owned = true
  material.userData.ownsMap = true
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(height * aspect, height, 1)
  sprite.userData.noPick = true
  return sprite
}

export function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry?.userData.owned) o.geometry.dispose()
    const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of materials) {
      if (!m.userData.owned) continue
      if (m.userData.ownsMap) m.map?.dispose()
      m.dispose()
    }
    if (o.isInstancedMesh) o.dispose()
  })
}
