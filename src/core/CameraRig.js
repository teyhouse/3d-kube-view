import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const UP = new THREE.Vector3(0, 1, 0)
const FLIGHT_TIME = 0.9

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera
    this.controls = new OrbitControls(camera, dom)
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.08,
      minPolarAngle: 0.15,
      maxPolarAngle: 1.32,
      minDistance: 5,
      maxDistance: 450,
      screenSpacePanning: false,
      zoomSpeed: 1.2
    })
    this.keys = new Set()
    this.flight = null
    this.controls.addEventListener('start', () => (this.flight = null))
    addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement) return
      this.keys.add(e.code)
    })
    addEventListener('keyup', e => this.keys.delete(e.code))
    addEventListener('blur', () => this.keys.clear())
  }

  frame(box, { instant = false, tightness = 0.85 } = {}) {
    const center = box.getCenter(new THREE.Vector3())
    const radius = box.getSize(new THREE.Vector3()).length() / 2
    const fov = THREE.MathUtils.degToRad(this.camera.fov)
    const fit = Math.min(fov, fov * this.camera.aspect)
    const distance = THREE.MathUtils.clamp((radius / Math.sin(fit / 2)) * tightness, this.controls.minDistance, this.controls.maxDistance)
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    const position = center.clone().addScaledVector(dir, distance)
    if (instant) {
      this.camera.position.copy(position)
      this.controls.target.copy(center)
      this.controls.update()
      return
    }
    this.flight = { t: 0, fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone(), toPos: position, toTarget: center }
  }

  get distance() {
    return this.camera.position.distanceTo(this.controls.target)
  }

  update(dt) {
    this.updateKeys(dt)
    const f = this.flight
    if (f) {
      f.t = Math.min(1, f.t + dt / FLIGHT_TIME)
      const k = ease(f.t)
      this.camera.position.lerpVectors(f.fromPos, f.toPos, k)
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k)
      if (f.t === 1) this.flight = null
    }
    this.controls.update()
  }

  updateKeys(dt) {
    if (!this.keys.size) return
    const has = (...codes) => codes.some(c => this.keys.has(c))
    const { camera, controls } = this
    const offset = camera.position.clone().sub(controls.target)
    const boost = has('ShiftLeft', 'ShiftRight') ? 3 : 1

    const forward = offset.clone().setY(0).normalize().negate()
    const right = new THREE.Vector3().crossVectors(forward, UP).normalize()
    const move = new THREE.Vector3()
    if (has('KeyW', 'ArrowUp')) move.add(forward)
    if (has('KeyS', 'ArrowDown')) move.sub(forward)
    if (has('KeyD', 'ArrowRight')) move.add(right)
    if (has('KeyA', 'ArrowLeft')) move.sub(right)
    if (move.lengthSq() > 0) {
      this.flight = null
      move.normalize().multiplyScalar(Math.max(8, offset.length() * 0.8) * boost * dt)
      camera.position.add(move)
      controls.target.add(move)
    }

    let yaw = 0
    let zoom = 0
    if (has('KeyQ')) yaw += 1.4 * dt * boost
    if (has('KeyE')) yaw -= 1.4 * dt * boost
    if (has('KeyR', 'Equal', 'NumpadAdd')) zoom -= 1
    if (has('KeyF', 'Minus', 'NumpadSubtract')) zoom += 1
    if (yaw || zoom) {
      this.flight = null
      offset.applyAxisAngle(UP, yaw)
      offset.multiplyScalar(1 + zoom * 1.3 * dt * boost)
      offset.clampLength(controls.minDistance, controls.maxDistance)
      camera.position.copy(controls.target).add(offset)
    }
  }
}
