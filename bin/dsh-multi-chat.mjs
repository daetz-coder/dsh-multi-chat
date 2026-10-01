#!/usr/bin/env node
/**
 * dsh-multi-chat — install / manage the multi-window wall plugin and its
 * authenticated gateway, from anywhere `npx dsh-multi-chat` can run.
 *
 * Subcommands:
 *   install [--profile web]   pack the plugin, `dsh plugin add` it into the
 *                             profile, and append the enable patch row.
 *   start [options]           start N loopback `dsh web` instances (cross-
 *                             platform replacement for scripts/start-multi.ps1);
 *                             with --remote, put an authenticated gateway in
 *                             front of each so a phone/remote machine can log
 *                             in with a token.
 *   stop                      stop everything `start` recorded (instances +
 *                             gateways).
 *   gateway [options...]      run the authenticated gateway itself (forwards
 *                             to scripts/gateway.mjs).
 *
 * The PowerShell scripts remain the Windows-native path; this CLI is the
 * npx/distribution path and works on Windows, macOS, and Linux.
 */

import { spawn, spawnSync } from 'node:child_process'
import { createServer as createNetServer } from 'node:net'
import { existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATE_FILE = join(ROOT, '.wall-pids.json')

// Node ≥22 warns about spawn(shell:true, args[]) (DEP0190). The args here are
// fixed strings we control (numeric ports, our own paths), so the warning is
// noise; drop only that message and keep other warnings visible.
process.removeAllListeners('warning')
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && /shell option true/.test(warning.message)) return
  process.stderr.write(`Warning: ${warning.message}\n`)
})

/* ------------------------------------------------------------------ */
/* Small helpers.                                                     */
/* ------------------------------------------------------------------ */

function shell(win32) { return win32 || false }
const isWin = process.platform === 'win32'

function run(file, args, { cwd = ROOT, okCodes = [0] } = {}) {
  const result = spawnSync(file, args, { cwd, shell: isWin, encoding: 'utf8' })
  if (!okCodes.includes(result.status ?? -1)) {
    throw new Error(`command failed (${file} ${args.join(' ')}) exit ${result.status}\n${result.stdout ?? ''}${result.stderr ?? ''}`)
  }
  return result.stdout ?? ''
}

function dshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function probe(port, token = null, timeoutMs = 600) {
  const url = token === null ? `http://127.0.0.1:${port}/` : `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    const body = await res.text()
    return res.status === 200 && body.includes('__DSH_BOOT__')
  } catch {
    return false
  }
}

async function waitReady(port, token = null, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    // A cold instance accepts the connection but needs noticeably longer than
    // a warm one to assemble index.html, so the readiness probe gets its own
    // generous budget; `probe`'s 600ms default is tuned for the wall's liveness
    // polls against already-running instances, not for boot detection.
    if (await probe(port, token, 10000)) return true
    if (Date.now() > deadline) return false
    await sleep(400)
  }
}

function spawnDetached(file, args, { shell = false, logFile = null } = {}) {
  // A log file is requested by handing `spawn` the file descriptors, not with
  // the shell's `>` syntax: a DETACHED shell does not pass our stdio handles on
  // to the process it wraps, so the redirect silently produces an empty file.
  const stdio = logFile === null ? 'ignore' : ['ignore', openSync(logFile, 'a'), openSync(logFile, 'a')]
  const child = spawn(file, args, {
    detached: true,
    stdio,
    windowsHide: true,
    shell,
  })
  child.unref()
  return child.pid
}

/**
 * Resolve the `dsh` CLI's JavaScript entry so an instance can be launched as
 * `node <entry> web --port <n>` with no shell in between.
 *
 * Two reasons this is not optional: on Windows Node refuses to execute the
 * `dsh.cmd` shim without a shell, and once a shell IS involved the detached
 * child never receives the stdio handles carrying the launch token. Spawning
 * the entry directly gives the instance an inherited log handle, which is how
 * `readLaunchToken` below gets to see the token.
 * @returns the absolute path to the CLI entry, or null when it cannot be found.
 */
function dshCliEntry() {
  const lookup = spawnSync(isWin ? 'where' : 'which', ['dsh'], { encoding: 'utf8' })
  const shim = (lookup.stdout ?? '').split(/\r?\n/).map(line => line.trim()).find(Boolean)
  if (shim === undefined) return null
  const candidates = isWin
    // <npm-bin>\dsh.cmd  ->  <npm-bin>\node_modules\@deepseek-ai\dsh\lib\bin.js
    ? [join(dirname(shim), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')]
    // <prefix>/bin/dsh is a symlink to .../lib/node_modules/@deepseek-ai/dsh/lib/bin.js
    : [
      (() => { try { return join(realpathSync(shim), '..', 'bin.js') } catch { return '' } })(),
      join(dirname(shim), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    ]
  return candidates.find(candidate => candidate !== '' && existsSync(candidate)) ?? null
}

/**
 * Each `dsh web` process mints one launch token at boot and prints it as
 * `dsh web: http://127.0.0.1:<port>/?token=<tok>`. Since DSH 0.2 every
 * instance answers an unauthenticated `/` with 401, so the wall's liveness
 * probe must present this token or it will mark every instance dead.
 *
 * The token is per-process and is never persisted by DSH, so we read it off
 * the instance's own console output — hence the log file: piping stdout would
 * leave the detached child writing into a pipe nobody drains once this
 * process exits.
 */
const LAUNCH_TOKEN_RE = /\/\?token=([A-Za-z0-9_-]+)/

async function readLaunchToken(logFile, port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  const needle = `127.0.0.1:${port}/?token=`
  for (;;) {
    let text = ''
    try { text = readFileSync(logFile, 'utf8') } catch { /* not created yet */ }
    if (text !== '') {
      // Match only this port's line: every instance shares one log-free
      // console, and another port's token would authenticate nothing.
      const line = text.split(/\r?\n/).find(l => l.includes(needle))
      const match = line === undefined ? null : LAUNCH_TOKEN_RE.exec(line)
      if (match !== null) return match[1]
    }
    if (Date.now() > deadline) return null
    await sleep(400)
  }
}

/**
 * The wall runs inside the profile's copy of this package while the CLI may
 * run from an npx cache, so a package-relative file would never be shared.
 * `$DSH_HOME` is the one location both sides resolve identically.
 */
const INSTANCES_FILE = () => join(dshHome(), 'multi-wall-instances.json')

function writeInstanceTokens(tokens) {
  const file = INSTANCES_FILE()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ updatedAt: new Date().toISOString(), tokens }, null, 2), 'utf8')
}

function killPid(pid) {
  if (isWin) {
    spawnSync('taskkill', ['/PID', String(pid), '/F', '/T'], { stdio: 'ignore' })
  } else {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
    setTimeout(() => { try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ } }, 500)
  }
}

function writeState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* install                                                           */
/* ------------------------------------------------------------------ */

const INSTALL_HELP = `dsh-multi-chat install — install the multi-window wall plugin

Usage:
  dsh-multi-chat install [--profile web]

Packs the dsh-multi-chat package and installs the tarball into the profile
with \`dsh plugin --profile <p> add\`. The package declares \`dsh.bundle.patch\`
(pointing at its own cordis.patch.yml), so DSH mounts it automatically as a
bundle layer — no manual profile patch is needed. Restart dsh web afterwards.

The install also writes \`minimumReleaseAge: 0\` into the profile's
pnpm-workspace.yaml (only if no explicit value is set): pnpm ≥ 11 filters
freshly published versions by default (1 day), which would otherwise make
\`dsh plugin --profile web add dsh-multi-chat\` silently fall back to an older
release. With the gate disabled, every registry install resolves the newest.

Uninstall with: dsh plugin --profile <p> remove dsh-multi-chat
`

/**
 * Ensure the profile's pnpm-workspace.yaml disables pnpm ≥ 11's
 * minimumReleaseAge gate (default 1 day), so registry installs like
 * `dsh plugin --profile web add dsh-multi-chat` always resolve the newest
 * release instead of silently falling back to an older one. Respects an
 * explicit user-set value; only writes when the key is absent.
 */
function ensureFreshReleasePolicy(profileDir) {
  const wsFile = join(profileDir, 'pnpm-workspace.yaml')
  const existing = existsSync(wsFile) ? readFileSync(wsFile, 'utf8') : null
  if (existing !== null && /^\s*minimumReleaseAge\s*:/m.test(existing)) {
    return false
  }
  const anchor = '\n# dsh-multi-chat: disable pnpm minimumReleaseAge so `dsh plugin add` always resolves the newest release\nminimumReleaseAge: 0\n'
  writeFileSync(wsFile, `${existing ?? 'packages:\n  - .\n'}${anchor}`, 'utf8')
  return true
}

async function cmdInstall(args) {
  let profile = 'web'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile') profile = args[++i] ?? 'web'
    else if (args[i] === '--help') { process.stdout.write(INSTALL_HELP); return }
    else throw new Error(`unknown install option: ${args[i]}`)
  }

  // 1) pack the tarball into a STABLE location under DSH home. The
  // profile records a `file:` dependency on the tarball, so a temp directory
  // (deleted after install) would break every later `dsh plugin add` — the
  // tarball must outlive the CLI run. (npm pack is offline-safe.)
  const stableDir = join(dshHome(), 'profiles', profile, 'plugins')
  mkdirSync(stableDir, { recursive: true })
  const packOut = run('npm', ['pack', '--pack-destination', stableDir], { cwd: ROOT })
  const tarballName = packOut.trim().split(/\r?\n/).pop()
  const tarball = join(stableDir, tarballName)
  if (!existsSync(tarball)) throw new Error('npm pack produced no tarball')

  // 2) install into the profile. DSH reconciles `dsh.profile.bundles` from the
  // installed dependency set: because this package declares `dsh.bundle.patch`,
  // `dsh plugin add` leaves it in the bundle layer stack and its own
  // cordis.patch.yml is mounted automatically — no manual profile patch edits.
  process.stdout.write(`installing ${tarballName} into profile '${profile}'…\n`)
  run('dsh', ['plugin', '--profile', profile, 'add', tarball])

  // 3) disable pnpm's release-age gate for this profile so the registry
  // one-liner (`dsh plugin --profile web add dsh-multi-chat`) — and every
  // later add/update — resolves the newest version, not a stale fallback.
  const profileDir = join(dshHome(), 'profiles', profile)
  if (ensureFreshReleasePolicy(profileDir)) {
    process.stdout.write(`disabled pnpm minimumReleaseAge in ${join(profileDir, 'pnpm-workspace.yaml')} — future registry installs resolve the newest version\n`)
  }

  process.stdout.write('\nDone. Restart dsh web to load the wall:\n')
  process.stdout.write('  dsh web --port <n>\n')
}

/* ------------------------------------------------------------------ */
/* start                                                             */
/* ------------------------------------------------------------------ */

const START_HELP = `dsh-multi-chat start — start N loopback DSH web instances

Usage:
  dsh-multi-chat start [--ports 3080,3081,3082,3083] [--remote] [--token <secret>]
                       [--gateway-ports 8080,8081,8082,8083] [--no-open]

Options:
  --ports <list>          comma-separated loopback instance ports (default 3080..3083)
  --remote                put an authenticated gateway (0.0.0.0) in front of
                          every instance for phone/remote access
  --token <secret>        gateway login token; required with --remote (a random
                          one is generated and printed when omitted)
  --gateway-ports <list>  external gateway ports; default instance-port + 5000
  --tls-cert/--tls-key    PEM files; enables HTTPS on every gateway
  --name <label>          gateway login page label (default DSH)
  --no-open               do not open the browser
  --help                  show this help

Examples:
  dsh-multi-chat start --ports 3080,3081
  dsh-multi-chat start --remote --token hunter2 --ports 3080,3081 --gateway-ports 8440,8441
`

async function cmdStart(args) {
  const opts = {
    ports: '3080,3081,3082,3083',
    remote: false,
    token: null,
    gatewayPorts: null,
    tlsCert: null,
    tlsKey: null,
    name: 'DSH',
    noOpen: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    switch (a) {
      case '--ports': opts.ports = args[++i] ?? opts.ports; break
      case '--remote': opts.remote = true; break
      case '--token': opts.token = args[++i] ?? null; break
      case '--gateway-ports': opts.gatewayPorts = args[++i] ?? null; break
      case '--tls-cert': opts.tlsCert = args[++i] ?? null; break
      case '--tls-key': opts.tlsKey = args[++i] ?? null; break
      case '--name': opts.name = args[++i] ?? opts.name; break
      case '--no-open': opts.noOpen = true; break
      case '--help': process.stdout.write(START_HELP); return
      default: throw new Error(`unknown start option: ${a}`)
    }
  }
  const ports = opts.ports.split(',').map(p => p.trim()).filter(p => /^\d+$/.test(p)).map(Number)
  if (ports.length === 0) throw new Error(`no valid ports in: ${opts.ports}`)

  let token = opts.token
  if (opts.remote && token === null) {
    token = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('')
    process.stdout.write(`[start] generated gateway token: ${token}  (save it!)\n`)
  }

  // Resolve the dsh launcher once. The shell form only resolves the .cmd shim;
  // it is the fallback for when the CLI entry cannot be located.
  const dshFile = 'dsh'
  const dshShell = isWin
  const dshEntry = dshCliEntry()

  const state = { pid: [], ports: [], gateways: [], startedAt: new Date().toISOString() }
  const started = []

  const tokens = {}
  const logDir = join(dshHome(), 'multi-wall-logs')
  mkdirSync(logDir, { recursive: true })

  for (const port of ports) {
    const logFile = join(logDir, `instance-${port}.log`)
    // Prefer the shell-free form: only then does the instance inherit the log
    // handle and its launch token become readable to `readLaunchToken`.
    const pid = dshEntry === null
      ? spawnDetached(dshFile, ['web', '--port', String(port)], { shell: dshShell, logFile })
      : spawnDetached(process.execPath, [dshEntry, 'web', '--port', String(port)], { logFile })
    state.pid.push(pid)
    state.ports.push(port)
    process.stdout.write(`dsh web --port ${port} (pid ${pid})\n`)
    if (dshEntry === null) {
      process.stdout.write('  ⚠ dsh CLI entry not resolvable; launch-token capture unavailable\n')
    }
    // Read the launch token before probing: an unauthenticated request answers
    // 401, which would report every freshly started instance as dead.
    const token = await readLaunchToken(logFile, port)
    if (token !== null) tokens[port] = token
    const ready = await waitReady(port, token, 60000)
    if (!ready) {
      process.stdout.write(`  ⚠ instance on :${port} did not answer the DSH shell yet — check ${logFile}\n`)
    } else {
      process.stdout.write(`  ✓ ready${token === null ? ' (no launch token printed)' : ' (launch token captured)'}\n`)
    }
    started.push(port)
  }

  if (Object.keys(tokens).length > 0) {
    writeInstanceTokens(tokens)
    process.stdout.write(`instance tokens saved to ${INSTANCES_FILE()}\n`)
  }

  if (opts.remote) {
    const explicitGatewayPorts = opts.gatewayPorts !== null
      ? opts.gatewayPorts.split(',').map(p => p.trim()).filter(p => /^\d+$/.test(p)).map(Number)
      : null
    if (explicitGatewayPorts !== null && explicitGatewayPorts.length < ports.length) {
      throw new Error(`--gateway-ports needs one port per instance port (got ${explicitGatewayPorts.length} for ${ports.length})`)
    }
    const gatewayFile = join(ROOT, 'scripts', 'gateway.mjs')
    if (!existsSync(gatewayFile)) throw new Error(`gateway script not found: ${gatewayFile}`)
    const usedGatewayPorts = new Set()
    for (let i = 0; i < ports.length; i++) {
      const port = ports[i]
      // Auto-advance past Windows excluded port ranges (Hyper-V/WinNAT) and
      // busy ports so a default +5000 mapping never silently fails to bind;
      // already-assigned ports are skipped so two gateways never collide.
      const desired = explicitGatewayPorts !== null ? explicitGatewayPorts[i] : port + 5000
      const gatewayPort = await reserveGatewayPort(desired, usedGatewayPorts)
      if (gatewayPort !== desired) process.stdout.write(`  gateway port ${desired} not bindable — using ${gatewayPort}\n`)
      const gwArgs = ['--target', `127.0.0.1:${port}`, '--listen', `0.0.0.0:${gatewayPort}`, '--token', token, '--name', opts.name]
      if (opts.tlsCert !== null && opts.tlsKey !== null) {
        gwArgs.push('--tls-cert', opts.tlsCert, '--tls-key', opts.tlsKey)
      }
      const pid = spawnDetached(process.execPath, [gatewayFile, ...gwArgs])
      state.gateways.push({ port, gatewayPort, pid })
      process.stdout.write(`gateway :${gatewayPort} -> 127.0.0.1:${port} (pid ${pid})\n`)
    }
  }

  writeState(state)
  process.stdout.write(`state saved to ${STATE_FILE}\n`)

  if (opts.remote) {
    const scheme = opts.tlsCert !== null ? 'https' : 'http'
    const ips = lanIps()
    process.stdout.write('\nphone / remote access (token required):\n')
    state.gateways.forEach((g) => {
      const hosts = ips.length > 0 ? ips : ['localhost']
      process.stdout.write(`  ${hosts.map(ip => `${scheme}://${ip}:${g.gatewayPort}/`).join('  ')}  -> dsh :${g.port}\n`)
    })
    process.stdout.write(`  token: ${token}\n`)
  } else if (!opts.noOpen && isWin) {
    spawn('cmd', ['/c', 'start', '', `http://127.0.0.1:${started[0]}`], { stdio: 'ignore', detached: true }).unref()
  }
}

function lanIps() {
  const out = []
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address)
    }
  }
  return out
}

/** Whether a TCP port can be bound (catches Windows excluded ranges like
 * Hyper-V/WinNAT's 8017–8116 and busy ports). */
function canBind(port) {
  return new Promise(resolve => {
    const srv = createNetServer()
    srv.once('error', () => resolve(false))
    srv.listen(port, '127.0.0.1', () => { srv.close(() => resolve(true)) })
  })
}

/** Pick the first bindable port at or after `desired` that is not already
 * assigned to another gateway in this run (probes up to 500 ports). */
async function reserveGatewayPort(desired, used) {
  for (let candidate = desired; candidate < desired + 500; candidate++) {
    if (used.has(candidate)) continue
    if (await canBind(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
  throw new Error(`no bindable gateway port near ${desired} (Windows excluded ranges or busy ports)`)
}

/* ------------------------------------------------------------------ */
/* stop                                                              */
/* ------------------------------------------------------------------ */

const STOP_HELP = `dsh-multi-chat stop — stop everything \`start\` recorded

Usage:
  dsh-multi-chat stop

Reads ${STATE_FILE} and terminates the recorded dsh instances and gateways.
`

async function cmdStop() {
  const state = readState()
  if (state === null) {
    process.stdout.write(`no state file at ${STATE_FILE} — nothing to stop\n`)
    return
  }
  let count = 0
  for (const pid of [...(state.pid ?? []), ...(state.gateways ?? []).map(g => g.pid)]) {
    if (typeof pid !== 'number') continue
    killPid(pid)
    count++
    process.stdout.write(`stopped pid ${pid}\n`)
  }
  rmSync(STATE_FILE, { force: true })
  process.stdout.write(`stopped ${count} process(es); removed ${STATE_FILE}\n`)
}

/* ------------------------------------------------------------------ */
/* gateway                                                           */
/* ------------------------------------------------------------------ */

async function cmdGateway(args) {
  const script = join(ROOT, 'scripts', 'gateway.mjs')
  if (!existsSync(script)) throw new Error(`gateway script not found: ${script}`)
  const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 1))
}

/* ------------------------------------------------------------------ */
/* Main.                                                              */
/* ------------------------------------------------------------------ */

const MAIN_HELP = `dsh-multi-chat — multi-window wall + authenticated remote access for DSH

Usage:
  dsh-multi-chat install [--profile web]      install the wall plugin
  dsh-multi-chat start [options]              start instances (+ gateways with --remote)
  dsh-multi-chat stop                         stop what start recorded
  dsh-multi-chat gateway [options]            run the authenticated gateway
  dsh-multi-chat --help                       this help

Run "dsh-multi-chat <cmd> --help" for command details.
`

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  try {
    switch (cmd) {
      case 'install': await cmdInstall(rest); break
      case 'start': await cmdStart(rest); break
      case 'stop': await cmdStop(); break
      case 'gateway': await cmdGateway(rest); break
      case '--help':
      case '-h':
      case undefined:
        process.stdout.write(MAIN_HELP)
        break
      default:
        throw new Error(`unknown command: ${cmd}`)
    }
  } catch (error) {
    process.stderr.write(`[dsh-multi-chat] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

void main()
