const KEY = 'kube-view:hidden-namespaces'

export class Selection {
  constructor() {
    this.hidden = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'))
    this.listeners = []
  }

  isVisible(name) {
    return !this.hidden.has(name)
  }

  toggle(name) {
    if (this.hidden.has(name)) this.hidden.delete(name)
    else this.hidden.add(name)
    this.commit()
  }

  only(names, all) {
    const keep = new Set(names)
    this.hidden = new Set(all.filter(name => !keep.has(name)))
    this.commit()
  }

  onChange(fn) {
    this.listeners.push(fn)
  }

  commit() {
    localStorage.setItem(KEY, JSON.stringify([...this.hidden]))
    this.listeners.forEach(fn => fn())
  }
}
