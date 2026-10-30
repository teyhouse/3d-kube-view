const TEMPLATE = `
  <button class="tl-play" title="Pause or resume (Space)">❚❚</button>
  <input class="tl-slider" type="range" min="0" max="1000" value="1000" aria-label="Replay position" />
  <span class="tl-label">LIVE</span>
  <button class="tl-speed" title="Replay speed">1x</button>
  <button class="tl-live" title="Back to live">Live</button>
`
const SPEEDS = [1, 2, 4, 8]

export class TimelineBar {
  constructor(root, timeline) {
    this.timeline = timeline
    root.classList.add('panel', 'timeline')
    root.innerHTML = TEMPLATE
    this.play = root.querySelector('.tl-play')
    this.slider = root.querySelector('.tl-slider')
    this.label = root.querySelector('.tl-label')
    this.speed = root.querySelector('.tl-speed')
    this.dragging = false

    this.play.addEventListener('click', () => {
      timeline.togglePause()
      this.play.blur()
    })
    root.querySelector('.tl-live').addEventListener('click', e => {
      timeline.goLive()
      e.currentTarget.blur()
    })
    this.speed.addEventListener('click', () => {
      timeline.speed = SPEEDS[(SPEEDS.indexOf(timeline.speed) + 1) % SPEEDS.length]
      this.speed.blur()
    })
    this.slider.addEventListener('input', () => {
      this.dragging = true
      this.label.textContent = this.format(this.sliderTime())
    })
    this.slider.addEventListener('change', () => {
      this.dragging = false
      timeline.seek(this.sliderTime())
      this.slider.blur()
    })
  }

  sliderTime() {
    const oldest = this.timeline.oldest
    return oldest + ((Date.now() - oldest) * Number(this.slider.value)) / 1000
  }

  format(t) {
    const seconds = Math.max(0, Math.round((Date.now() - t) / 1000))
    return `-${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  }

  update() {
    const { timeline } = this
    this.play.textContent = timeline.paused ? '▶' : '❚❚'
    this.speed.textContent = `${timeline.speed}x`
    if (this.dragging) return
    if (timeline.live) {
      this.slider.value = 1000
      this.label.textContent = 'LIVE'
      return
    }
    const oldest = timeline.oldest
    const span = Math.max(1, Date.now() - oldest)
    this.slider.value = Math.round(((timeline.cursor - oldest) / span) * 1000)
    this.label.textContent = `${timeline.paused ? 'PAUSED ' : ''}${this.format(timeline.cursor)}`
  }
}
