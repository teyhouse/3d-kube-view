
export function lineLeg(room, from, to, pace = 1) {
  return { key: `${room.namespace}:${keyOf(from)}>${keyOf(to)}`, room, from, to, pace, length: from.distanceTo(to), onEnter: null }
}

export function tubeLeg(tube, key, reversed) {
  return { key: `tube:${key}:${reversed ? 'r' : 'f'}`, tube, reversed, pace: 1, onEnter: null }
}

function keyOf(v) {
  return `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`
}

function legLength(leg) {
  return leg.tube ? leg.tube.length : leg.length
}

export class RoutePath {
  constructor(legs) {
    this.legs = legs
    this.measure()
  }

  measure() {
    this.length = this.legs.reduce((sum, leg) => sum + legLength(leg), 0)
  }

  sample(u, point) {
    let remaining = u * this.length
    const last = this.legs.length - 1
    for (let i = 0; i <= last; i++) {
      const leg = this.legs[i]
      const length = legLength(leg)
      if (remaining <= length || i === last) {
        const t = length > 0 ? Math.min(1, remaining / length) : 1
        if (leg.tube) {
          leg.tube.curve.getPoint(leg.reversed ? 1 - t : t, point)
        } else {
          point.lerpVectors(leg.from, leg.to, t).multiplyScalar(leg.room.scale.x).add(leg.room.position)
        }
        return i
      }
      remaining -= length
    }
    return last
  }
}

export function remapProgress(previous, next, u) {
  const oldLegs = previous.legs
  const newLegs = next.legs
  let prefix = 0
  while (prefix < oldLegs.length && prefix < newLegs.length && oldLegs[prefix].key === newLegs[prefix].key) prefix++
  let suffix = 0
  while (suffix < oldLegs.length - prefix && suffix < newLegs.length - prefix && oldLegs[oldLegs.length - 1 - suffix].key === newLegs[newLegs.length - 1 - suffix].key) suffix++

  const span = (legs, from, to) => legs.slice(from, to).reduce((sum, leg) => sum + legLength(leg), 0)
  const oldPrefix = span(oldLegs, 0, prefix)
  const newPrefix = span(newLegs, 0, prefix)
  const oldSuffix = span(oldLegs, oldLegs.length - suffix, oldLegs.length)
  const newSuffix = span(newLegs, newLegs.length - suffix, newLegs.length)
  const s = u * previous.length
  if (s <= oldPrefix) return next.length ? s / next.length : 0
  if (previous.length - s <= oldSuffix) return next.length ? (next.length - (previous.length - s)) / next.length : 1
  const oldMiddle = previous.length - oldPrefix - oldSuffix
  const newMiddle = next.length - newPrefix - newSuffix
  const fraction = oldMiddle > 0 ? (s - oldPrefix) / oldMiddle : 0
  return next.length ? (newPrefix + fraction * newMiddle) / next.length : 1
}
