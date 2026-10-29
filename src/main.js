import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import './styles.css'
import * as THREE from 'three'
import { Stage } from './core/Stage.js'
import { CameraRig } from './core/CameraRig.js'
import { Picker } from './core/Picker.js'
import { LightPool } from './core/LightPool.js'
import { ClusterWorld } from './scene/ClusterWorld.js'
import { PackageSystem } from './traffic/PackageSystem.js'
import { TrafficSystem } from './traffic/TrafficSystem.js'
import { ProcessFx } from './traffic/ProcessFx.js'
import { Hud } from './ui/Hud.js'
import { NamespacePanel } from './ui/NamespacePanel.js'
import { Selection } from './data/Selection.js'
import { connect } from './data/EventStream.js'

async function loadFonts() {
  const fonts = ['500 32px Fredoka', '600 32px Fredoka', '700 32px Fredoka'].map(f => document.fonts.load(f))
  await Promise.race([Promise.all(fonts), new Promise(r => setTimeout(r, 1500))])
}

function boot() {
  const stage = new Stage(document.getElementById('scene'))
  const rig = new CameraRig(stage.camera, stage.renderer.domElement)
  const lights = new LightPool(stage.scene)
  const world = new ClusterWorld()
  const trafficRoot = new THREE.Group()
  stage.scene.add(world.root, trafficRoot)

  const packages = new PackageSystem(trafficRoot)
  const traffic = new TrafficSystem(world, trafficRoot, packages)
  const fx = new ProcessFx(world, trafficRoot)
  const hud = new Hud(document.getElementById('hud'))
  const panel = new NamespacePanel(hud.namespaceRoot)
  const selection = new Selection()
  const picker = new Picker(stage.camera, stage.renderer.domElement, world.root)

  let topology = null
  let focus = -1
  let framed = false

  const focusRoom = index => {
    const rooms = world.order
    focus = index
    if (index < 0 || !rooms[index]) {
      focus = -1
      hud.setNav('Overview')
      rig.frame(world.roomsBounds())
      return
    }
    const room = rooms[index]
    hud.setNav(`${String(room.index + 1).padStart(2, '0')} · ${room.namespace}`)
    rig.frame(room.bounds(), { tightness: 0.75 })
  }

  const focusNamespace = name => {
    const index = world.order.findIndex(r => r.namespace === name)
    if (index >= 0) focusRoom(index)
  }

  const render = ({ reframe = false } = {}) => {
    if (!topology) return
    const entries = topology.namespaces.map((data, index) => ({ data, index })).filter(e => selection.isVisible(e.data.name))
    const focused = world.order[focus]?.namespace
    const { layoutChanged, changed } = world.setTopology(entries)
    if (layoutChanged) traffic.reset()
    else traffic.invalidate(changed)
    panel.setNamespaces(topology.namespaces, name => selection.isVisible(name))

    focus = world.order.findIndex(r => r.namespace === focused)
    if (focus < 0) hud.setNav('Overview')
    if (!framed && world.order.length) {
      framed = true
      rig.frame(world.roomsBounds(), { instant: true })
    } else if (reframe && focus < 0) {
      rig.frame(world.roomsBounds())
    }
  }

  selection.onChange(() => render({ reframe: true }))
  panel.onToggle = name => selection.toggle(name)
  panel.onFocus = name => {
    if (!selection.isVisible(name)) selection.toggle(name)
    focusNamespace(name)
  }
  panel.onPreset = preset => {
    if (!topology) return
    const all = topology.namespaces.map(ns => ns.name)
    if (preset === 'all') selection.only(all, all)
    if (preset === 'none') selection.only([], all)
    if (preset === 'populated') selection.only(topology.namespaces.filter(ns => ns.pods.length).map(ns => ns.name), all)
  }

  hud.onStep = step => {
    const total = world.order.length + 1
    focusRoom(((focus + 1 + step + total) % total) - 1)
  }

  picker.onHover = (info, pos) => {
    stage.renderer.domElement.style.cursor = info ? 'pointer' : ''
    hud.showTooltip(info && `${info.type}: ${info.name ?? info.id}`, pos?.x, pos?.y)
  }
  picker.onSelect = info => hud.showDetails(world.describe(info))
  picker.onFocus = info => {
    if (!info) return
    if (info.type === 'namespace') return focusNamespace(info.id)
    const box = new THREE.Box3().setFromObject(info.object).expandByScalar(info.type === 'pod' ? 5 : 3)
    rig.frame(box, { tightness: 0.9 })
  }

  addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement) return
    if (e.code === 'Escape') {
      hud.showDetails(null)
      focusRoom(-1)
    }
    const digit = /^Digit([1-9])$/.exec(e.code)
    if (digit) focusRoom(Number(digit[1]) - 1)
  })

  connect(
    {
      config: cfg => hud.log('info', 'watching', cfg.namespaces === 'all' ? 'all namespaces' : cfg.namespaces.join(', ')),
      status: s => hud.setStatus(s.source, s.state, s.message),
      topology: next => {
        const first = !topology
        topology = next
        render()
        if (first) {
          const pods = next.namespaces.reduce((n, ns) => n + ns.pods.length, 0)
          hud.log('info', 'topology', `${next.namespaces.length} namespaces, ${pods} pods`)
        }
      },
      flows: flows => {
        traffic.handle(flows)
        for (const f of flows) {
          if (f.verdict === 'DROPPED') hud.log('drop', 'dropped', `${f.srcId} → ${f.dstId}:${f.port ?? ''}`)
        }
      },
      process: events => {
        fx.handle(events)
        for (const e of events) {
          if (!selection.isVisible(e.ns)) continue
          if (e.type === 'exec') hud.log('exec', e.binary.split('/').pop(), `${e.ns}/${e.pod}`)
          if (e.type === 'kprobe') hud.log('kprobe', e.fn, `${e.ns}/${e.pod}`)
        }
      }
    },
    {
      onOpen: () => hud.setStatus('stream', 'ok'),
      onClose: () => hud.setStatus('stream', 'error', 'reconnecting')
    }
  )

  let statsTime = 0
  stage.onTick((dt, time) => {
    rig.update(dt)
    picker.update()
    lights.update(dt, world.order, rig.controls.target)
    stage.followShadow(rig.controls.target, rig.distance)
    world.tick(dt, time)
    packages.tick(dt)
    traffic.tick()
    fx.tick(dt)
    statsTime += dt
    if (statsTime >= 1) {
      hud.setStats({
        flows: Math.round(traffic.counter / statsTime),
        parcels: packages.count,
        procs: Math.round(fx.counter / statsTime)
      })
      panel.setActivity(traffic.activeNamespaces())
      traffic.counter = 0
      fx.counter = 0
      statsTime = 0
    }
  })

  stage.start()
}

loadFonts().then(boot)
