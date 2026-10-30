import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { config } from './config.js'

const REMOTE_WATCHDOG = 'exec 3<&0; ( cat <&3 >/dev/null; kill $$; sleep 3; kill -9 $$ ) & exec "$@" </dev/null'
const children = new Set()

const baseArgs = () => (config.context ? ['--context', config.context] : [])

process.on('exit', () => children.forEach(child => child.kill()))

export function execStream(pod, container, command) {
  return ['exec', '-i', '-n', 'kube-system', pod, '-c', container, '--', 'sh', '-c', REMOTE_WATCHDOG, 'stream', ...command]
}

export function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.kubectl, [...baseArgs(), ...args])
    let out = ''
    let err = ''
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (err += d))
    child.on('error', reject)
    child.on('close', code => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `kubectl exited with ${code}`))))
  })
}

export async function listPods(namespace, selector) {
  const out = await run(['get', 'pods', '-n', namespace, '-l', selector, '-o', 'jsonpath={.items[*].metadata.name}'])
  return out.split(/\s+/).filter(Boolean)
}

export function supervise(args, { onLine, onError, onStart }) {
  let child = null
  let stopped = false
  let delay = 1000
  let timer = null

  const start = () => {
    let started = false
    let stderr = ''
    child = spawn(config.kubectl, [...baseArgs(), ...args])
    const current = child
    children.add(current)
    createInterface({ input: child.stdout }).on('line', line => {
      if (!started) {
        started = true
        delay = 1000
        onStart?.()
      }
      onLine(line)
    })
    child.stderr.on('data', d => (stderr = (stderr + d).slice(-2000)))
    child.on('error', e => onError?.(e.message))
    child.on('close', code => {
      children.delete(current)
      if (stopped) return
      onError?.(stderr.trim().split('\n').pop() || `stream exited with ${code}`)
      timer = setTimeout(start, delay)
      delay = Math.min(delay * 2, 30000)
    })
  }

  start()
  return () => {
    stopped = true
    clearTimeout(timer)
    child?.kill()
  }
}
