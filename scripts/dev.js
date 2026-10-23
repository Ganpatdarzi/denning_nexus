/**
 * Runs the API and the Vite dev server side by side with prefixed output.
 * Deliberately dependency-free so `npm run dev` works straight after install.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const targets = [
  { name: 'api', color: '\x1b[38;5;191m', args: ['--prefix', 'server', 'run', 'dev'] },
  { name: 'web', color: '\x1b[38;5;105m', args: ['--prefix', 'client', 'run', 'dev'] },
]

const children = targets.map((target) => {
  const child = spawn(npm, target.args, {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const pipe = (stream, destination) => {
    stream.setEncoding('utf8')
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        destination.write(`${target.color}[${target.name}]\x1b[0m ${line}\n`)
      }
    })
  }

  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code) => {
    if (code && code !== 0) {
      process.stderr.write(`\x1b[31m[${target.name}] exited with code ${code}\x1b[0m\n`)
    }
  })
  return child
})

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log('\n  \x1b[1mDenning Nexus\x1b[0m is starting…')
console.log('  web  \x1b[36mhttp://localhost:5173\x1b[0m')
console.log('  api  \x1b[36mhttp://localhost:4000/api/health\x1b[0m\n')
