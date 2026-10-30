import * as THREE from 'three'

const box = new THREE.Box3()
const size = new THREE.Vector3()
const center = new THREE.Vector3()
const origin = new THREE.Vector3()
const inverse = new THREE.Matrix4()
const relative = new THREE.Matrix4()

export function batchStatic(parent, roots) {
  parent.updateWorldMatrix(true, true)
  inverse.copy(parent.matrixWorld).invert()
  const groups = new Map()

  for (const root of roots) {
    box.setFromObject(root)
    box.getSize(size)
    box.getCenter(center)
    root.getWorldPosition(origin)
    root.userData.bounds = { size: size.clone(), center: center.clone().sub(origin), bottom: box.min.y - origin.y }
    root.traverse(mesh => {
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.noPick || mesh.material.userData.owned) return
      const key = `${mesh.geometry.uuid}:${mesh.material.uuid}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({ mesh, root })
    })
  }

  for (const entries of groups.values()) {
    if (entries.length < 2) continue
    const { geometry, material, castShadow } = entries[0].mesh
    const instanced = new THREE.InstancedMesh(geometry, material, entries.length)
    instanced.castShadow = castShadow
    instanced.receiveShadow = true
    instanced.userData.instancePicks = []
    entries.forEach(({ mesh, root }, i) => {
      relative.multiplyMatrices(inverse, mesh.matrixWorld)
      instanced.setMatrixAt(i, relative)
      instanced.userData.instancePicks[i] = root
      mesh.removeFromParent()
    })
    parent.add(instanced)
  }
}
