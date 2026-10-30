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
const SEGMENTS = 48
const CONTROLS = ['v0', 'v1', 'v2', 'v3']

function arc(a, b) {
  const lift = Math.max(10, a.distanceTo(b) * 0.35)
  return new THREE.CubicBezierCurve3(a.clone(), a.clone().add(new THREE.Vector3(0, lift, -lift * 0.5)), b.clone().add(new THREE.Vector3(0, lift, 0)), b.clone())
}

function geometryOf(curve) {
  const geometry = new THREE.TubeGeometry(curve, SEGMENTS, 0.55, 10, false)
  geometry.userData.owned = true
  return geometry
}

export class Tube extends THREE.Group {
  constructor(a, b, startId, endId) {
    super()
    this.startId = startId
    this.endId = endId
    this.curve = arc(a, b)
    this.length = this.curve.getLength()
    this.from = null
    this.to = null
    this.next = null
    this.mesh = new THREE.Mesh(geometryOf(this.curve), material)
    this.mesh.renderOrder = 2
    this.mesh.frustumCulled = false
    this.caps = [new THREE.Mesh(ring, ringMaterial), new THREE.Mesh(ring, ringMaterial)]
    this.caps.forEach(cap => (cap.castShadow = true))
    this.add(this.mesh, ...this.caps)
    this.placeCaps()
  }

  placeCaps() {
    this.caps[0].position.copy(this.curve.v0)
    this.caps[0].lookAt(this.curve.getPoint(0.03))
    this.caps[1].position.copy(this.curve.v3)
    this.caps[1].lookAt(this.curve.getPoint(0.97))
  }

  retarget(a, b) {
    if (!this.to && a.distanceTo(this.curve.v0) < 0.01 && b.distanceTo(this.curve.v3) < 0.01) return false
    this.mesh.geometry.dispose()
    this.next?.dispose()
    this.from = this.curve.clone()
    this.to = arc(a, b)
    this.length = this.to.getLength()
    this.next = geometryOf(this.to)
    const base = geometryOf(this.curve)
    base.morphAttributes.position = [this.next.attributes.position.clone()]
    this.mesh.geometry = base
    this.mesh.updateMorphTargets()
    this.mesh.morphTargetInfluences[0] = 0
    return true
  }

  advance(k) {
    if (!this.to) return
    for (const c of CONTROLS) this.curve[c].lerpVectors(this.from[c], this.to[c], k)
    this.mesh.morphTargetInfluences[0] = k
    if (k < 1) {
      this.caps[0].position.copy(this.curve.v0)
      this.caps[1].position.copy(this.curve.v3)
      return
    }
    this.mesh.geometry.dispose()
    this.mesh.geometry = this.next
    this.mesh.morphTargetInfluences = undefined
    this.mesh.morphTargetDictionary = undefined
    this.next = this.from = this.to = null
    this.placeCaps()
  }
}
