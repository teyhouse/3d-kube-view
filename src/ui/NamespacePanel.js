const TEMPLATE = `
  <header>
    <h4>Namespaces</h4>
    <span class="ns-count"></span>
    <button class="ns-collapse" title="Toggle panel (N)">▾</button>
  </header>
  <div class="ns-body">
    <div class="ns-presets">
      <button data-preset="all">All</button>
      <button data-preset="populated">With pods</button>
      <button data-preset="none">None</button>
    </div>
    <input class="ns-search" type="search" placeholder="Filter namespaces" spellcheck="false" />
    <ul class="ns-list"></ul>
  </div>
`

export class NamespacePanel {
  constructor(root) {
    this.root = root
    root.classList.add('panel', 'namespaces')
    root.innerHTML = TEMPLATE
    this.list = root.querySelector('.ns-list')
    this.count = root.querySelector('.ns-count')
    this.search = root.querySelector('.ns-search')
    this.rows = new Map()
    this.onToggle = () => {}
    this.onPreset = () => {}
    this.onFocus = () => {}

    root.querySelector('.ns-collapse').addEventListener('click', () => this.collapse())
    root.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => this.onPreset(b.dataset.preset)))
    this.search.addEventListener('input', () => this.filter())
    addEventListener('keydown', e => {
      if (e.code === 'KeyN' && !(e.target instanceof HTMLInputElement)) this.collapse()
    })
  }

  collapse() {
    this.root.classList.toggle('collapsed')
  }

  setNamespaces(namespaces, isVisible) {
    const names = new Set(namespaces.map(ns => ns.name))
    for (const [name, row] of this.rows) {
      if (names.has(name)) continue
      row.el.remove()
      this.rows.delete(name)
    }
    namespaces.forEach((ns, index) => {
      let row = this.rows.get(ns.name)
      if (!row) {
        row = this.createRow(ns.name)
        this.rows.set(ns.name, row)
      }
      row.index.textContent = String(index + 1).padStart(2, '0')
      row.pods.textContent = ns.pods.length
      row.checkbox.checked = isVisible(ns.name)
      row.el.classList.toggle('off', !row.checkbox.checked)
      this.list.append(row.el)
    })
    const visible = namespaces.filter(ns => isVisible(ns.name)).length
    this.count.textContent = `${visible}/${namespaces.length}`
    this.filter()
  }

  createRow(name) {
    const el = document.createElement('li')
    el.innerHTML = '<label><input type="checkbox" /><i class="ns-dot"></i><span class="ns-index"></span><span class="ns-name"></span></label><span class="ns-pods"></span>'
    el.querySelector('.ns-name').textContent = name
    el.dataset.name = name
    const checkbox = el.querySelector('input')
    checkbox.addEventListener('change', () => this.onToggle(name))
    el.querySelector('.ns-name').addEventListener('dblclick', e => {
      e.preventDefault()
      this.onFocus(name)
    })
    return { el, checkbox, index: el.querySelector('.ns-index'), pods: el.querySelector('.ns-pods') }
  }

  setActivity(active) {
    for (const [name, row] of this.rows) row.el.classList.toggle('active', active.has(name))
  }

  filter() {
    const term = this.search.value.trim().toLowerCase()
    for (const [name, row] of this.rows) row.el.hidden = term !== '' && !name.includes(term)
  }
}
