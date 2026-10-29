import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${root}.browser/ms-playwright`

const url = process.argv[2] ?? 'http://127.0.0.1:5173/'
const outDir = process.argv[3] ?? `${root}screenshots`
const settle = Number(process.env.SETTLE_MS ?? 8000)

const { chromium } = await import('playwright')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  env: { ...process.env, LD_LIBRARY_PATH: `${root}.browser/libs/usr/lib/x86_64-linux-gnu` }
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('console', m => m.type() === 'error' && console.log('console error:', m.text()))
page.on('pageerror', e => console.log('page error:', e.message))

await page.goto(url)
await page.waitForTimeout(settle)
await page.screenshot({ path: `${outDir}/overview.png` })
console.log(`${outDir}/overview.png`)

const rooms = await page.evaluate(() => document.querySelectorAll('.nav button').length && 9)
for (let i = 1; i <= rooms; i++) {
  await page.keyboard.press(`Digit${i}`)
  await page.waitForTimeout(2500)
  const label = await page.textContent('.nav-label')
  if (label === 'Overview') break
  await page.screenshot({ path: `${outDir}/room-${i}.png` })
  console.log(`${outDir}/room-${i}.png`)
}

await browser.close()
