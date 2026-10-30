import * as THREE from 'three'
import { block, textPlane, disposeTree } from '../objects/primitives.js'
import { surface } from '../theme/materials.js'
import { palette, hex } from '../theme/palette.js'

const CELL = 1.5
const COLS = 12
const GAP = 8
const POD = new THREE.BoxGeometry(1.1, 1, 1.1)
const dummy = new THREE.Object3D()
const tint = new THREE.Color()

function hue(name) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360
  return hash / 360
}

export class NodeYard extends THREE.Group {
  constructor() {
    super()
    this.signature = ''
    this.nodes = new Map()
    this.width = 0
    this.depth = 0
  }

  update(topology) {
    const pods = topology.namespaces.flatMap(ns => ns.pods.map(pod => ({ ns: ns.name, node: pod.node, phase: pod.phase })))
    const signature = JSON.stringify([topology.nodes, pods])
    if (signature === this.signature) return
    this.signature = signature
    for (const child of [...this.children]) {
      this.remove(child)
      disposeTree(child)
    }
    this.nodes.clear()

    let x = 0
    this.depth = 0
    for (const node of topology.nodes) {
      const mine = pods.filter(p => p.node === node.name).sort((a, b) => a.ns.localeCompare(b.ns))
      const rows = Math.max(1, Math.ceil(mine.length / COLS))
      const width = COLS * CELL + 4
      const depth = rows * CELL + 8
      const group = new THREE.Group()
      group.position.set(x + width / 2, 0, depth / 2)
      group.add(this.plate(node, width, depth))
      if (mine.length) group.add(this.pods(mine, depth))
      group.userData.pick = { type: 'node', id: node.name }
      this.add(group)
      this.nodes.set(node.name, { ...node, pods: mine })
      x += width + GAP
      this.depth = Math.max(this.depth, depth)
    }
    this.width = Math.max(0, x - GAP)
    for (const child of this.children) child.position.x -= this.width / 2
  }

  plate(node, width, depth) {
    const plate = new THREE.Group()
    const slab = block(width, 1, depth, surface(node.ready ? palette.wallDark : palette.dropped), { radius: 0.3, shared: false })
    slab.position.y = -0.5
    const title = textPlane(node.name, 2.4, { color: hex(palette.districtText), maxWidth: width - 2 })
    title.rotation.x = -Math.PI / 2
    title.position.set(0, 0.03, depth / 2 - 1.6)
    plate.add(slab, title)
    return plate
  }

  pods(mine, depth) {
    const mesh = new THREE.InstancedMesh(POD, surface(0xffffff), mine.length)
    mine.forEach((pod, i) => {
      dummy.position.set((i % COLS) * CELL - ((COLS - 1) * CELL) / 2, 0.5, Math.floor(i / COLS) * CELL - depth / 2 + 2)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, tint.setHSL(hue(pod.ns), 0.55, pod.phase === 'Running' ? 0.72 : 0.4))
    })
    mesh.castShadow = true
    return mesh
  }

  describe(id) {
    const node = this.nodes.get(id)
    if (!node) return null
    const counts = new Map()
    for (const pod of node.pods) counts.set(pod.ns, (counts.get(pod.ns) ?? 0) + 1)
    return {
      title: node.name,
      subtitle: 'Node',
      rows: [
        ['Ready', node.ready ? 'yes' : 'no'],
        ['Roles', node.roles.join(', ') || 'none'],
        ['Kubelet', node.kubelet ?? 'unknown'],
        ['CPU', node.cpu ?? 'unknown'],
        ['Memory', node.memory ?? 'unknown'],
        ['Pods', node.pods.length]
      ],
      sections: [{ title: 'Pods by namespace', items: [...counts].sort((a, b) => b[1] - a[1]).map(([ns, n]) => `${ns}: ${n}`) }]
    }
  }
}
