import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { palette } from '../theme/palette.js'
import { GpuTimer } from './GpuTimer.js'

const SUN_DIR = new THREE.Vector3(0.55, 1, 0.7).normalize()

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.95

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(palette.background)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.3

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 3000)
    this.camera.position.set(60, 55, 70)

    const hemi = new THREE.HemisphereLight(0xe8dcff, 0x3a2b6b, 0.85)
    this.sun = new THREE.DirectionalLight(0xfff1e0, 2.3)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.03
    this.sun.shadow.radius = 4
    this.scene.add(hemi, this.sun, this.sun.target)

    this.callbacks = []
    this.gpuTimer = new GpuTimer(this.renderer)
    this.onFrame = () => {}
    this.resize()
    addEventListener('resize', () => this.resize())
  }

  resize() {
    const { innerWidth: w, innerHeight: h } = window
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  followShadow(target, distance) {
    const radius = THREE.MathUtils.clamp(distance * 0.75, 30, 180)
    if (this.shadowCenter && this.shadowCenter.distanceTo(target) < radius * 0.05 && Math.abs(radius - this.shadowRadius) < radius * 0.1) return
    this.shadowCenter = target.clone()
    this.shadowRadius = radius
    this.sun.target.position.copy(target)
    this.sun.position.copy(target).addScaledVector(SUN_DIR, radius * 2)
    const cam = this.sun.shadow.camera
    cam.left = cam.bottom = -radius
    cam.right = cam.top = radius
    cam.near = 1
    cam.far = radius * 4
    cam.updateProjectionMatrix()
  }

  onTick(fn) {
    this.callbacks.push(fn)
  }

  start() {
    let last = performance.now()
    this.renderer.setAnimationLoop(now => {
      const frameMs = now - last
      const dt = Math.min(frameMs / 1000, 0.1)
      last = now
      const start = performance.now()
      for (const fn of this.callbacks) fn(dt, now / 1000)
      this.gpuTimer.poll()
      this.gpuTimer.begin()
      this.renderer.render(this.scene, this.camera)
      this.gpuTimer.end()
      this.onFrame({ frameMs, cpuMs: performance.now() - start })
    })
  }
}
