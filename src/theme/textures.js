import * as THREE from 'three'
import { palette } from './palette.js'

export const FONT = 'Fredoka, ui-rounded, "Segoe UI", system-ui, sans-serif'

const measure = document.createElement('canvas').getContext('2d')
const hazardCache = new Map()
let hazardBase = null

function toTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export function labelTexture(text, { color = palette.textDark, background = null, size = 96, weight = 700, padding = 0.4 } = {}) {
  measure.font = `${weight} ${size}px ${FONT}`
  const pad = Math.round(size * padding)
  const width = Math.ceil(measure.measureText(text).width) + pad * 2
  const height = Math.round(size * 1.45)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (background) {
    ctx.fillStyle = background
    ctx.beginPath()
    ctx.roundRect(0, 0, width, height, height / 2)
    ctx.fill()
  }
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, height / 2 + size * 0.05)
  return { texture: toTexture(canvas), aspect: width / height }
}

function hazardCanvas() {
  if (hazardBase) return hazardBase
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = palette.hazardDark
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = palette.hazardYellow
  for (let i = -128; i < 256; i += 64) {
    ctx.beginPath()
    ctx.moveTo(i, 128)
    ctx.lineTo(i + 32, 128)
    ctx.lineTo(i + 160, 0)
    ctx.lineTo(i + 128, 0)
    ctx.closePath()
    ctx.fill()
  }
  hazardBase = canvas
  return canvas
}

export function hazardMaterial(repeatX = 1, repeatY = 1) {
  const rx = Math.max(1, Math.round(repeatX))
  const ry = Math.max(1, Math.round(repeatY))
  const key = `${rx}:${ry}`
  if (!hazardCache.has(key)) {
    const texture = toTexture(hazardCanvas())
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(rx, ry)
    hazardCache.set(key, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 }))
  }
  return hazardCache.get(key)
}
