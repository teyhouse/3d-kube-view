const TEMPLATE = `
  <div class="panel brand">
    <div class="title"><span class="logo"></span>KUBE<b>VIEW</b></div>
    <div class="chips">
      <span class="chip" data-source="stream">stream</span>
      <span class="chip" data-source="kubectl">kubectl</span>
      <span class="chip" data-source="hubble">hubble</span>
      <span class="chip" data-source="tetragon">tetragon</span>
    </div>
  </div>
  <div class="panel stats">
    <div><b data-stat="flows">0</b><span>flows/s</span></div>
    <div><b data-stat="parcels">0</b><span>parcels</span></div>
    <div><b data-stat="procs">0</b><span>proc/s</span></div>
  </div>
  <div class="ns-panel"></div>
  <div class="panel log"><h4>Live events</h4><ul></ul></div>
  <div class="panel details hidden"></div>
  <div class="tooltip hidden"></div>
  <div class="legend">
    <span><i style="--c:#c6e86e"></i>TCP</span>
    <span><i style="--c:#aedaf6"></i>UDP</span>
    <span><i style="--c:#f6bbe6"></i>HTTP</span>
    <span><i style="--c:#ffd5a0"></i>ICMP</span>
    <span><i style="--c:#ff4d61"></i>Dropped</span>
  </div>
  <div class="help">WASD pan · Q/E rotate · R/F zoom · Shift faster · Click select · Double click or 1-9 focus · N namespaces · Esc overview</div>
  <div class="nav">
    <button data-step="-1" aria-label="previous">‹</button>
    <span class="nav-label">Overview</span>
    <button data-step="1" aria-label="next">›</button>
  </div>
`

const MAX_LOG = 40

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export class Hud {
  constructor(root) {
    root.innerHTML = TEMPLATE
    this.root = root
    this.logList = root.querySelector('.log ul')
    this.details = root.querySelector('.details')
    this.tooltip = root.querySelector('.tooltip')
    this.navLabel = root.querySelector('.nav-label')
    this.namespaceRoot = root.querySelector('.ns-panel')
    this.onStep = () => {}
    root.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => this.onStep(Number(b.dataset.step))))
  }

  setStatus(source, state, message = '') {
    const chip = this.root.querySelector(`[data-source="${source}"]`)
    if (!chip) return
    chip.dataset.state = state
    chip.title = message
  }

  setStats(stats) {
    for (const [key, value] of Object.entries(stats)) {
      const node = this.root.querySelector(`[data-stat="${key}"]`)
      if (node) node.textContent = value
    }
  }

  log(kind, text, detail = '') {
    const item = el('li', kind)
    item.append(el('time', '', new Date().toLocaleTimeString()), el('b', '', text))
    if (detail) item.append(el('span', '', detail))
    this.logList.prepend(item)
    while (this.logList.children.length > MAX_LOG) this.logList.lastChild.remove()
  }

  showDetails(info) {
    this.details.replaceChildren()
    if (!info) {
      this.details.classList.add('hidden')
      return
    }
    this.details.append(el('small', '', info.subtitle), el('h3', '', info.title))
    const table = el('dl')
    for (const [k, v] of info.rows) table.append(el('dt', '', k), el('dd', '', String(v)))
    this.details.append(table)
    this.details.classList.remove('hidden')
  }

  showTooltip(text, x, y) {
    if (!text) {
      this.tooltip.classList.add('hidden')
      return
    }
    this.tooltip.textContent = text
    this.tooltip.style.transform = `translate(${x + 14}px, ${y + 14}px)`
    this.tooltip.classList.remove('hidden')
  }

  setNav(label) {
    this.navLabel.textContent = label
  }
}
