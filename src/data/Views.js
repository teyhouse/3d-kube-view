const KEY = 'kube-view:views'

export class Views {
  constructor() {
    this.items = JSON.parse(localStorage.getItem(KEY) ?? '[]')
  }

  save(view) {
    this.items = [...this.items.filter(v => v.name !== view.name), view].sort((a, b) => a.name.localeCompare(b.name))
    this.commit()
  }

  remove(name) {
    this.items = this.items.filter(v => v.name !== name)
    this.commit()
  }

  get(name) {
    return this.items.find(v => v.name === name)
  }

  commit() {
    localStorage.setItem(KEY, JSON.stringify(this.items))
  }
}
