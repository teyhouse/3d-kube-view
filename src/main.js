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
import { ProcessFx, nameOf } from './traffic/ProcessFx.js'
import { FloatingTags } from './traffic/FloatingTags.js'
import { AlertSystem } from './traffic/AlertSystem.js'
import { Hud } from './ui/Hud.js'
import { NamespacePanel } from './ui/NamespacePanel.js'
import { AlertFeed } from './ui/AlertFeed.js'
import { PerfMeter } from './ui/PerfMeter.js'
import { TimelineBar } from './ui/TimelineBar.js'
import { Selection } from './data/Selection.js'
import { Views } from './data/Views.js'
import { Timeline } from './data/Timeline.js'
import { FlowFilter } from './data/FlowFilter.js'
import { connect } from './data/EventStream.js'

async function loadFonts() {
  const fonts = ['500 32px Fredoka', '600 32px Fredoka', '700 32px Fredoka'].map(f => document.fonts.load(f))
  await Promise.race([Promise.all(fonts), new Promise(r => setTimeout(r, 1500))])
}

const DISTRICTS_KEY = 'kube-view:districts'
const SELECTION_DELAY_MS = 250
const OVERVIEW_TIGHTNESS = 1.05
const DISTRICT_FRAME_TOP = 10

function boot() {
  const stage = new Stage(document.getElementById('scene'))
  const rig = new CameraRig(stage.camera, stage.renderer.domElement)
  const lights = new LightPool(stage.scene)
  const world = new ClusterWorld()
  const trafficRoot = new THREE.Group()
  stage.scene.add(world.root, world.exitRoot, trafficRoot)

  const packages = new PackageSystem(trafficRoot)
  const tags = new FloatingTags(trafficRoot)
  const filter = new FlowFilter()
  const traffic = new TrafficSystem(world, trafficRoot, packages, tags, filter)
  const fx = new ProcessFx(world, tags)
  const alerts = new AlertSystem(world, tags)
  const hud = new Hud(document.getElementById('hud'))
  const panel = new NamespacePanel(hud.namespaceRoot)
  const alertFeed = new AlertFeed(hud.alertRoot)
  const perf = new PerfMeter(hud.perfRoot)
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
    const change = world.setTopology(entries, { animate: framed, districts, entryPoints: topology.entryPoints ?? [] })
    world.updateNodes(topology)
    traffic.applyChange(change)
    tags.forget(change.left)
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
        { title: 'Recent DNS and HTTP', items: traffic.recentL7(info.ns, info.id) },
        { title: 'Recent processes', items: fx.recent(info.ns, info.id) },
        ...base.sections
      ]
    }
  }

  const flyToPod = (ns, name) => {
    const room = world.rooms.get(ns)
    if (!room) return false
    const station = room.stations.get(name)
    room.setFar(false)
    const box = station ? new THREE.Box3().setFromObject(station).expandByScalar(5) : room.bounds()
    rig.frame(box, { tightness: 0.9 })
    return true
  }

  const dispatch = (kind, items, replay) => {
    if (kind === 'flows') {
      traffic.handle(items)
      if (replay) return
      for (const f of items) {
        if (f.verdict === 'DROPPED') hud.log('drop', f.dropReason ?? 'dropped', `${f.srcId} → ${f.dstId}:${f.port ?? ''}`)
      }
      return
    }
    fx.handle(items)
    alerts.handle(items, replay)
    if (replay) return
    for (const e of items) {
      if (e.type !== 'exit' && !e.severity) hud.log(e.type === 'exec' ? 'exec' : 'kprobe', nameOf(e), `${e.ns}/${e.pod}`)
    }
  }

  const timeline = new Timeline(dispatch)
  timeline.onSeek = () => packages.clear()
  const timelineBar = new TimelineBar(hud.timelineRoot, timeline)

  alerts.onChange = list => alertFeed.render(list)
  alertFeed.onClear = () => alerts.clear()
  alertFeed.onOpen = alert => flyToPod(alert.ns, alert.pod)

  hud.onKindToggle = (kind, enabled) => {
    if (enabled) filter.off.delete(kind)
    else filter.off.add(kind)
  }
  hud.search.addEventListener('input', () => {
    filter.text = hud.search.value.trim().toLowerCase()
  })
  hud.search.addEventListener('keydown', e => {
    if (e.code !== 'Enter' || !filter.text) return
    for (const room of world.order) {
      const pod = [...room.pods.keys()].find(name => `${room.namespace}/${name}`.includes(filter.text))
      if (pod && flyToPod(room.namespace, pod)) return
    }
  })

  stage.onFrame = timing => {
    perf.gpuSupported = stage.gpuTimer.supported
    perf.gpuMs = stage.gpuTimer.value
    perf.record(timing, stage.renderer.info.render)
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
    if (info.type === 'district') box.max.y = Math.max(box.max.y, DISTRICT_FRAME_TOP)
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
    if (e.code === 'Space') {
      e.preventDefault()
      timeline.togglePause()
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
      flows: flows => timeline.push('flows', flows),
      process: events => timeline.push('process', events)
    },
    {
      onOpen: () => hud.setStatus('stream', 'ok'),
      onClose: () => hud.setStatus('stream', 'error', 'reconnecting')
    }
  )

  let statsTime = 0
  stage.onTick((realDt, time) => {
    const dt = timeline.paused ? 0 : realDt
    rig.update(realDt)
    timeline.tick(realDt)
    timelineBar.update()
    picker.update()
    lights.update(dt, world.order, rig.controls.target)
    stage.followShadow(rig.controls.target, rig.distance)
    world.updateView(realDt, stage.camera, rig.controls.target)
    packages.setShadows(world.anyNear)
    viewProjection.multiplyMatrices(stage.camera.projectionMatrix, stage.camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(viewProjection)
    world.tick(dt, time)
    traffic.tick()
    tickRollers(dt)
    highlighter.tick(time)
    packages.tick(dt, frustum)
    tags.tick(dt)
    statsTime += realDt
    if (statsTime >= 1) {
      hud.setStats({
        flows: Math.round(traffic.counter / statsTime),
        parcels: packages.count,
        procs: Math.round(fx.counter / statsTime)
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
