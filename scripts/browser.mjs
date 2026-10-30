import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const localBrowsers = `${root}.browser/ms-playwright`

export async function launchBrowser() {
  const local = existsSync(localBrowsers)
  if (local) process.env.PLAYWRIGHT_BROWSERS_PATH ??= localBrowsers
  const { chromium } = await import('playwright')
  return chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    env: local ? { ...process.env, LD_LIBRARY_PATH: `${root}.browser/libs/usr/lib/x86_64-linux-gnu` } : process.env
  })
}
