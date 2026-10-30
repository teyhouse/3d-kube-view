const KINDS = { ICMPv4: 'ICMP', ICMPv6: 'ICMP', http: 'HTTP', dns: 'DNS' }

export class FlowFilter {
  constructor() {
    this.off = new Set()
    this.text = ''
  }

  kindOf(flow) {
    if (flow.verdict === 'DROPPED') return 'Dropped'
    return KINDS[flow.l7] ?? KINDS[flow.proto] ?? flow.proto
  }

  accepts(flow) {
    if (this.off.has(this.kindOf(flow))) return false
    return !this.text || flow.srcId.includes(this.text) || flow.dstId.includes(this.text)
  }
}
