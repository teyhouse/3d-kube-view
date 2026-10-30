const SMOOTHING = 0.15
const MAX_PENDING = 4

export class GpuTimer {
  constructor(renderer) {
    this.gl = renderer.getContext()
    this.ext = this.gl.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null
    this.supported = this.ext !== null
    this.pending = []
    this.active = null
    this.value = null
  }

  begin() {
    if (!this.supported || this.pending.length >= MAX_PENDING) return
    this.active = this.gl.createQuery()
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active)
  }

  end() {
    if (!this.active) return
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.pending.push(this.active)
    this.active = null
  }

  poll() {
    const { gl, ext } = this
    while (this.pending.length) {
      const query = this.pending[0]
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return
      this.pending.shift()
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6
        this.value = this.value === null ? ms : this.value + (ms - this.value) * SMOOTHING
      }
      gl.deleteQuery(query)
    }
  }
}
