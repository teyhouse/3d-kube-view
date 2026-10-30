const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export class AlertFeed {
  constructor(root) {
    this.root = root
    root.classList.add('panel', 'alerts', 'hidden')
    this.title = el('h4', '', 'Alerts')
    this.clear = el('button', 'alerts-clear', 'Clear')
    const header = el('header')
    header.append(this.title, this.clear)
    this.list = el('ul')
    root.append(header, this.list)
    this.onOpen = () => {}
    this.onClear = () => {}
    this.clear.addEventListener('click', () => this.onClear())
  }

  render(alerts) {
    this.root.classList.toggle('hidden', alerts.length === 0)
    this.title.textContent = `Alerts (${alerts.length})`
    this.list.replaceChildren(
      ...alerts.slice(0, 20).map(alert => {
        const row = el('li', alert.severity)
        const button = el('button')
        button.append(el('b', '', alert.count > 1 ? `${alert.title} ×${alert.count}` : alert.title), el('span', '', `${alert.ns}/${alert.pod}`), el('span', '', alert.detail))
        button.addEventListener('click', () => this.onOpen(alert))
        row.append(button)
        return row
      })
    )
  }
}
