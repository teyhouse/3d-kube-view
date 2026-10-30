import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './browser.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.SMOKE_PORT ?? 8765)
const base = `http://127.0.0.1:${port}`
const TIMEOUT_MS = 120000
const MIN_COLORS = 8
const IGNORED_CONSOLE = /GPU stall|GL Driver|WebGL/

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, DEMO: '1', PORT: String(port) },
  stdio: 'inherit'
})

const problems = []
let browser = null

function check(name, passed, detail = '') {
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`)
  if (!passed) problems.push(name)
}

async function waitForServer() {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    const ok = await fetch(`${base}/`).then(res => res.ok).catch(() => false)
    if (ok) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('server did not start')
}

function requestWithHost(host) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ default: http }) => {
      const req = http.get({ port, host: '127.0.0.1', path: '/api/events', headers: { Host: host } }, res => {
        resolve(res.statusCode)
        res.destroy()
      })
      req.on('error', reject)
    })
  })
}

async function colorCount(page) {
  const image = (await page.screenshot({ timeout: TIMEOUT_MS })).toString('base64')
  return page.evaluate(async data => {
    const element = new Image()
    element.src = `data:image/png;base64,${data}`
    await element.decode()
    const canvas = document.createElement('canvas')
    canvas.width = element.width
    canvas.height = element.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(element, 0, 0)
    const left = Math.floor(element.width * 0.25)
    const width = Math.floor(element.width * 0.5)
    const pixels = ctx.getImageData(left, 100, width, element.height - 250).data
    const colors = new Set()
    for (let i = 0; i < pixels.length; i += 400) colors.add(`${pixels[i] >> 3},${pixels[i + 1] >> 3},${pixels[i + 2] >> 3}`)
    return colors.size
  }, image)
}

async function run() {
  await waitForServer()
  check('server answers', true)
  check('api answers on localhost', (await requestWithHost(`127.0.0.1:${port}`)) === 200)
  check('api rejects foreign host', (await requestWithHost('evil.example')) === 403)

  browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.setDefaultTimeout(TIMEOUT_MS)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !IGNORED_CONSOLE.test(message.text())) errors.push(message.text())
  })

  try {
    await page.goto(base)
    await page.waitForSelector('.loading', { state: 'detached' })
    check('loading screen finishes', true)

    await page.waitForFunction(() => document.querySelector('.ns-count')?.textContent === '7/7')
    check('topology arrives', true, '7 namespaces')

    await page.waitForFunction(() => Number(document.querySelector('[data-stat=parcels]')?.textContent) > 0)
    check('traffic flows', true, `${await page.textContent('[data-stat=parcels]')} parcels`)

    const colors = await colorCount(page)
    check('scene renders', colors >= MIN_COLORS, `${colors} colors`)

    await page.click('[data-preset="none"]')
    await page.waitForFunction(() => document.querySelector('.ns-count')?.textContent === '0/7')
    await page.click('[data-preset="all"]')
    await page.waitForFunction(() => document.querySelector('.ns-count')?.textContent === '7/7')
    check('namespace toggle works', true)

    await page.keyboard.press('Space')
    await page.waitForFunction(() => document.querySelector('.tl-label')?.textContent.startsWith('PAUSED'))
    check('pause works', true)

    check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  } finally {
    await mkdir(`${root}screenshots`, { recursive: true })
    await page.screenshot({ path: `${root}screenshots/smoke.png`, timeout: TIMEOUT_MS }).catch(() => {})
  }
}

let failed = false
try {
  await run()
} catch (error) {
  console.error(`FAIL ${error.message}`)
  failed = true
} finally {
  await browser?.close()
  server.kill()
}

if (failed || problems.length) process.exit(1)
console.log('smoke test passed')
