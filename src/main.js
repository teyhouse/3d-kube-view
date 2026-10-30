import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import './styles.css'
import * as THREE from 'three'
import { Stage } from './core/Stage.js'
import { CameraRig } from './core/CameraRig.js'
import { Picker } from './core/Picker.js'
import { LightPool } from './core/LightPool.js'
import { Highlighter } from './core/Highlighter.js'
import { isTyping } from './core/isTyping.js'
import { tickRollers } from './objects/Conveyor.js'
import { ClusterWorld } from './scene/ClusterWorld.js'
import { PackageSystem } from './traffic/PackageSystem.js'
import { TrafficSystem } from './traffic/TrafficSystem.js'
import { ProcessFx } from './traffic/ProcessFx.js'
import { Hud } from './ui/Hud.js'
import { NamespacePanel } from './ui/NamespacePanel.js'
import { Selection } from './data/Selection.js'
import { Views } from './data/Views.js'
import { connect } from './data/EventStream.js'

async function loadFonts() {
  const fonts = ['500 32px Fredoka', '600 32px Fredoka', '700 32px Fredoka'].map(f => document.fonts.load(f))
  await Promise.race([Promise.all(fonts), new Promise(r => setTimeout(r, 1500))])
}

const DISTRICTS_KEY = 'kube-view:districts'
const SELECTION_DELAY_MS = 250
const OVERVIEW_TIGHTNESS = 1.05

function boot() {
  const stage = new Stage(document.getElementById('scene'))
  const rig = new CameraRig(stage.camera, stage.renderer.domElement)
  const lights = new LightPool(stage.scene)
  const world = new ClusterWorld()
  const trafficRoot = new THREE.Group()
  stage.scene.add(world.root, world.exitRoot, trafficRoot)

  const packages = new PackageSystem(trafficRoot)
  const traffic = new TrafficSystem(world, trafficRoot, packages)
  const fx = new ProcessFx(world, trafficRoot)
  const hud = new Hud(document.getElementById('hud'))
  const panel = new NamespacePanel(hud.namespaceRoot)
  const selection = new Selection()
  const views = new Views()
  const frustum = new THREE.Frustum()
  const viewProjection = new THREE.Matrix4()
  const picker = new Picker(stage.camera, stage.renderer.domElement, world.root)
  const highlighter = new Highlighter()

  let topology = null
  let focus = -1
  let framed = false
  let districts = localStorage.getItem(DISTRICTS_KEY) !== 'off'
  let clientId = null
  let selectTimer = null
  let selected = null

  panel.districts.checked = districts
  panel.setViews(views.items)

  const publishSelection = () => {
    if (!clientId) return
    clearTimeout(selectTimer)
    selectTimer = setTimeout(() => {
      fetch('/api/selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: clientId, hidden: [...selection.hidden] })
      }).catch(() => {})
    }, SELECTION_DELAY_MS)
  }

  const focusRoom = index => {
    const rooms = world.order
    focus = index
    if (index < 0 || !rooms[index]) {
      focus = -1
      hud.setNav('Overview')
      rig.frame(world.roomsBounds(), { tightness: OVERVIEW_TIGHTNESS })
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
    if (districts) entries.sort((a, b) => (a.data.district ?? '').localeCompare(b.data.district ?? '') || a.index - b.index)
    const focused = world.order[focus]?.namespace
    const change = world.setTopology(entries, { animate: framed, districts })
    world.updateNodes(topology)
    traffic.applyChange(change)
    fx.forget(change.left)
    panel.setNamespaces(topology.namespaces, name => selection.isVisible(name))

    focus = world.order.findIndex(r => r.namespace === focused)
    if (focus < 0) hud.setNav('Overview')
    if (!framed && world.order.length) {
      framed = true
      rig.frame(world.roomsBounds(), { instant: true, tightness: OVERVIEW_TIGHTNESS })
    } else if (reframe) {
      rig.frame(focus < 0 ? world.roomsBounds() : world.order[focus].bounds(), { tightness: focus < 0 ? OVERVIEW_TIGHTNESS : 0.75 })
    }
  }

  selection.onChange(() => {
    publishSelection()
    render({ reframe: true })
  })
  panel.onDistricts = enabled => {
    districts = enabled
    localStorage.setItem(DISTRICTS_KEY, enabled ? 'on' : 'off')
    render({ reframe: true })
  }
  panel.onSaveView = name => {
    views.save({ name, hidden: [...selection.hidden], districts, camera: rig.pose() })
    panel.setViews(views.items)
  }
  panel.onDeleteView = name => {
    views.remove(name)
    panel.setViews(views.items)
  }
  panel.onApplyView = name => {
    const view = views.get(name)
    if (!view) return
    districts = view.districts
    panel.districts.checked = districts
    localStorage.setItem(DISTRICTS_KEY, districts ? 'on' : 'off')
    selection.setHidden(view.hidden)
    rig.flyTo(view.camera)
  }
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
    highlighter.hover(info?.object ?? null)
    hud.showTooltip(info && `${info.type}: ${info.name ?? info.id}`, pos?.x, pos?.y)
  }
  const describe = info => {
    const base = world.describe(info)
    if (!base || info.type !== 'pod') return base
    return {
      ...base,
      sections: [
        { title: 'Connections (last 30s)', items: traffic.connections(info.ns, info.id) },
        { title: 'Recent processes', items: fx.recent(info.ns, info.id) }
      ]
    }
  }

  picker.onSelect = info => {
    selected = info
    highlighter.select(info?.object ?? null)
    hud.showDetails(describe(info))
  }
  picker.onFocus = info => {
    if (!info) return
    if (info.type === 'namespace') return focusNamespace(info.id)
    const box = new THREE.Box3().setFromObject(info.object).expandByScalar(info.type === 'pod' ? 5 : 3)
    rig.frame(box, { tightness: 0.9 })
  }

  addEventListener('keydown', e => {
    if (isTyping(e)) return
    if (e.code === 'Escape') {
      selected = null
      hud.showDetails(null)
      highlighter.select(null)
      focusRoom(-1)
    }
    if (e.code === 'KeyB') {
      world.toggleNodes()
      if (focus < 0) rig.frame(world.roomsBounds(), { tightness: OVERVIEW_TIGHTNESS })
    }
    const digit = /^Digit([1-9])$/.exec(e.code)
    if (digit) focusRoom(Number(digit[1]) - 1)
  })

  connect(
    {
      config: cfg => {
        clientId = cfg.client
        publishSelection()
        hud.log('info', 'watching', cfg.namespaces === 'all' ? 'all namespaces' : cfg.namespaces.join(', '))
      },
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
    world.updateView(dt, stage.camera, rig.controls.target)
    packages.setShadows(world.anyNear)
    viewProjection.multiplyMatrices(stage.camera.projectionMatrix, stage.camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(viewProjection)
    world.tick(dt, time)
    traffic.tick()
    tickRollers(dt)
    highlighter.tick(time)
    packages.tick(dt, frustum)
    fx.tick(dt)
    statsTime += dt
    if (statsTime >= 1) {
      hud.setStats({
        flows: Math.round(traffic.counter / statsTime),
        parcels: packages.count,
        procs: Math.round(fx.counter / statsTime),
        draws: stage.renderer.info.render.calls
      })
      if (selected?.type === 'pod') hud.showDetails(describe(selected))
      panel.setActivity(traffic.activeNamespaces())
      traffic.counter = 0
      fx.counter = 0
      statsTime = 0
    }
  })

  stage.start()
}

loadFonts().then(boot)
