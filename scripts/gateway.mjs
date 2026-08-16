#!/usr/bin/env node
/**
 * dsh-multi-wall gateway — authenticated reverse proxy for one loopback DSH
 * instance.
 *
 * The official `dsh web` CLI deliberately forbids `--host 0.0.0.0` ("it would
 * expose remote code execution to the network"), so the safe way to reach a
 * DSH instance from a phone / another machine is a small auth-gated gateway
 * in front of the loopback instance:
 *
 *   node scripts/gateway.mjs \
 *     --target 127.0.0.1:3080 \
 *     --listen 0.0.0.0:8443 \
 *     --token <secret>
 *
 * The phone opens http://<lan-ip>:8443/ , enters the token once, and gets the
 * full DSH UI. Every proxied request has its Host/Origin rewritten to the
 * loopback target, so the official /api browser-trust fence (DNS-rebinding /
 * cross-site defense) treats it as a local request — no --trusted-host
 * restart needed. WebSocket upgrades (the /api mux and host-events channels)
 * and SSE streams pass through untouched.
 *
 * Security model:
 *   - Token authentication: an HMAC-signed session cookie (HttpOnly,
 *     SameSite=Strict, 12h default) after a successful login; the token is
 *     also accepted as `Authorization: Bearer <token>` or `?token=<token>`
 *     for scripts. Failed login attempts are rate-limited per IP.
 *   - Encryption: optional TLS via --tls-cert/--tls-key. On a trusted LAN the
 *     token over plain HTTP is acceptable; across the internet always use
 *     TLS (or run inside a VPN) — the DSH UI can execute commands as this
 *     machine's user.
 *   - The DSH instance itself stays on 127.0.0.1; only this gateway listens
 *     on the network.
 *
 * Zero dependencies: raw TCP head rewriting over node:net, node:crypto HMAC,
 * node:tls for the optional certificate.
 */

import { createServer as createNetServer, connect as netConnect } from 'node:net'
import { createServer as createTlsServer } from 'node:tls'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { URL } from 'node:url'

/* ------------------------------------------------------------------ */
/* Argument parsing (no deps).                                        */
/* ------------------------------------------------------------------ */

const HELP = `dsh-multi-wall gateway — authenticated proxy for one loopback DSH instance

Usage:
  node scripts/gateway.mjs --target <host:port> [options]

Required:
  --target <host:port>     the loopback DSH instance, e.g. 127.0.0.1:3080
  --token <secret>         the login token (required unless --no-auth)

Options:
  --listen <host:port>     listen address, default 0.0.0.0:<target-port + 5000>
  --tls-cert <file.pem>    TLS certificate (PEM) to enable HTTPS
  --tls-key <file.pem>     TLS private key (PEM)
  --max-age <hours>        session cookie lifetime, default 12
  --name <label>           instance label shown on the login page
  --no-auth                disable authentication (trusted/VPN networks only)
  --quiet                  log only errors
  --help                   show this help

The token is also accepted as "Authorization: Bearer <token>" or
"?token=<token>" on any request, which proceeds without a cookie (handy for
curl / scripts).

Examples:
  node scripts/gateway.mjs --target 127.0.0.1:3080 --listen 0.0.0.0:8443 --token hunter2
  node scripts/gateway.mjs --target 127.0.0.1:3080 --token hunter2 --tls-cert cert.pem --tls-key key.pem
`

function parseArgs(argv) {
  const opts = { listen: null, target: null, token: null, tlsCert: null, tlsKey: null, maxAgeHours: 12, name: 'DSH', noAuth: false, quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => argv[++i]
    switch (arg) {
      case '--target': opts.target = next(); break
      case '--listen': opts.listen = next(); break
      case '--token': opts.token = next(); break
      case '--tls-cert': opts.tlsCert = next(); break
      case '--tls-key': opts.tlsKey = next(); break
      case '--max-age': opts.maxAgeHours = Number(next()); break
      case '--name': opts.name = next(); break
      case '--no-auth': opts.noAuth = true; break
      case '--quiet': opts.quiet = true; break
      case '--help':
        process.stdout.write(HELP)
        process.exit(0)
        break
      default:
        process.stderr.write(`unknown option: ${arg}\n\n${HELP}`)
        process.exit(2)
    }
  }
  if (opts.target === undefined || !/^[^:/]+:\d+$/.test(opts.target)) {
    process.stderr.write('missing or malformed --target <host:port>\n\n' + HELP)
    process.exit(2)
  }
  if (!opts.noAuth && (opts.token === undefined || opts.token === '')) {
    process.stderr.write('missing --token <secret> (or pass --no-auth on a trusted network)\n\n' + HELP)
    process.exit(2)
  }
  if ((opts.tlsCert === null) !== (opts.tlsKey === null)) {
    process.stderr.write('--tls-cert and --tls-key must be provided together\n')
    process.exit(2)
  }
  return opts
}

/* ------------------------------------------------------------------ */
/* Helpers.                                                           */
/* ------------------------------------------------------------------ */

function lanAddresses() {
  const out = []
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address)
    }
  }
  return out
}

/** Constant-time hex string comparison (length-guarded). */
function safeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const a = Buffer.from(left, 'hex')
  const b = Buffer.from(right, 'hex')
  return a.length !== 0 && a.length === b.length && timingSafeEqual(a, b)
}

const hmac = (data) => createHmac('sha256', opts.token).update(data).digest('hex')

/** Session cookie: base64url(payload).hmac where payload = { exp } — the HMAC
 * key is the shared token, so only a token holder can mint a session. */
function signSession(exp) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url')
  return `${payload}.${hmac(payload)}`
}

function verifySession(value) {
  const dot = typeof value === 'string' ? value.lastIndexOf('.') : -1
  if (dot <= 0) return false
  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  if (!safeEqualHex(sig, hmac(payload))) return false
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof parsed.exp === 'number' && parsed.exp > Date.now()
  } catch {
    return false
  }
}

/** Minimal HTTP/1.1 head parse; null until the head is complete. */
function parseHead(buffer) {
  const idx = buffer.indexOf('\r\n\r\n')
  if (idx === -1) return null
  const head = buffer.subarray(0, idx + 4).toString('latin1')
  const lines = head.split('\r\n')
  const requestLine = lines[0].match(/^(\S+)\s+(\S+)\s+(HTTP\/\d\.\d)$/)
  const headers = []
  const map = {}
  for (const line of lines.slice(1)) {
    const ci = line.indexOf(':')
    if (ci === -1) continue
    const name = line.slice(0, ci).trim().toLowerCase()
    const value = line.slice(ci + 1).trim()
    map[name] = value
    headers.push([name, value])
  }
  return {
    malformed: requestLine === null,
    headBytes: idx + 4,
    method: requestLine?.[1] ?? '',
    target: requestLine?.[2] ?? '',
    version: requestLine?.[3] ?? '',
    headers,
    map,
  }
}

function targetPath(target) {
  try {
    return new URL(target, 'http://gateway.local').pathname
  } catch {
    return '/'
  }
}

function log(message) {
  if (!opts.quiet) process.stdout.write(`[gateway] ${message}\n`)
}

/* ------------------------------------------------------------------ */
/* Local responses (login page + errors).                             */
/* ------------------------------------------------------------------ */

function loginPage(name, error, next) {
  const err = error === '' ? '' : `<p class="err">${error}</p>`
  const nxt = (next ?? '').replace(/"/g, '&quot;')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} · 访问认证</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0d1117; color:#e6edf3;
         display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  form { background:#161b22; border:1px solid #30363d; border-radius:12px;
         padding:32px 36px; width:min(320px, 90vw); box-shadow:0 8px 30px #0006; }
  h1 { font-size:16px; margin:0 0 18px; font-weight:600; }
  .err { color:#f85149; font-size:12px; margin:0 0 12px; min-height:16px; }
  label { font-size:13px; color:#8b949e; }
  input { width:100%; box-sizing:border-box; margin:6px 0 16px; padding:9px 10px;
          border-radius:8px; border:1px solid #30363d; background:#0d1117; color:#e6edf3; font-size:14px; }
  button { width:100%; padding:10px; border:none; border-radius:8px; background:#2f81f7;
           color:#fff; font-size:14px; font-weight:600; cursor:pointer; }
  button:hover { background:#388bfd; }
</style>
</head>
<body>
<form method="post" action="/__gw__/login">
  <h1>${name} · 需要访问口令</h1>
  ${err}
  <label for="token">访问口令</label>
  <input id="token" name="token" type="password" autofocus autocomplete="current-password">
  <input type="hidden" name="next" value="${nxt}">
  <button type="submit">进入</button>
</form>
</body>
</html>`
}

function respondLogin(socket, name, next) {
  const html = loginPage(name, '', next)
  const body = Buffer.from(html, 'utf8')
  socket.write(
    'HTTP/1.1 401 Unauthorized\r\n'
    + 'content-type: text/html; charset=utf-8\r\n'
    + `content-length: ${body.length}\r\n`
    + 'connection: close\r\n'
    + 'cache-control: no-store\r\n\r\n',
  )
  socket.write(body)
  socket.end()
}

function respondPlain(socket, status, text) {
  const body = Buffer.from(text, 'utf8')
  socket.write(
    `HTTP/1.1 ${status}\r\n`
    + 'content-type: text/plain; charset=utf-8\r\n'
    + `content-length: ${body.length}\r\n`
    + 'connection: close\r\n'
    + 'cache-control: no-store\r\n\r\n',
  )
  socket.write(body)
  socket.end()
}

/* ------------------------------------------------------------------ */
/* Request head rewriting + transparent proxy.                        */
/* ------------------------------------------------------------------ */

/**
 * Rebuild the request head for the loopback target: Host and Origin point at
 * 127.0.0.1:<target-port> so the DSH /api browser-trust fence sees a local
 * request. Non-upgrade requests get `connection: close`, which forces a fresh
 * gateway connection (and therefore a fresh rewrite) per request — keep-alive
 * multiplexing would smuggle unrewritten Host headers past the fence.
 */
function rewriteHead(parsed, targetPort) {
  const upgrade = parsed.map.upgrade !== undefined
  const lines = [`${parsed.method} ${parsed.target} ${parsed.version}`]
  for (const [name, value] of parsed.headers) {
    if (name === 'host') {
      lines.push(`host: 127.0.0.1:${targetPort}`)
    } else if (name === 'origin') {
      lines.push(`origin: http://127.0.0.1:${targetPort}`)
    } else if (name === 'connection' || name === 'proxy-connection') {
      // dropped; re-added below with the right semantics
    } else {
      lines.push(`${name}: ${value}`)
    }
  }
  lines.push(upgrade ? 'connection: Upgrade' : 'connection: close')
  return lines.join('\r\n') + '\r\n\r\n'
}

/* ------------------------------------------------------------------ */
/* Rate limiting (per source IP, login POST only).                    */
/* ------------------------------------------------------------------ */

const attempts = new Map() // ip -> { fails, blockedUntil }

function isBlocked(ip) {
  const entry = attempts.get(ip)
  return entry !== undefined && entry.blockedUntil !== undefined && entry.blockedUntil > Date.now()
}

function registerFailure(ip) {
  const now = Date.now()
  const entry = attempts.get(ip) ?? { fails: 0, blockedUntil: undefined }
  if (entry.blockedUntil !== undefined && entry.blockedUntil > now) return
  entry.fails += 1
  if (entry.fails >= 5) {
    entry.fails = 0
    entry.blockedUntil = now + 60_000
    log(`rate-limited ${ip} for 60s`)
  }
  attempts.set(ip, entry)
  if (attempts.size > 512) {
    for (const [key, value] of attempts) {
      if (value.fails === 0 && value.blockedUntil === undefined) attempts.delete(key)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Per-socket flow.                                                   */
/* ------------------------------------------------------------------ */

/** Handle one accepted client socket: read the head, gate it, then either
 * answer locally (login flow / errors) or tunnel to the target with a
 * rewritten head. Works identically for plain TCP and TLS sockets, and for
 * WebSocket upgrades (after the head the pipes are raw bytes either way). */
function handleSocket(socket) {
  let buffer = Buffer.alloc(0)
  let headDone = false
  let proxying = false

  const onData = (chunk) => {
    if (headDone) return
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
    if (buffer.length > 65536) {
      headDone = true
      respondPlain(socket, 431, 'request head too large')
      return
    }
    const parsed = parseHead(buffer)
    if (parsed === null) return // head not complete yet

    headDone = true
    if (parsed.malformed) {
      respondPlain(socket, 400, 'malformed request')
      return
    }

    const path = targetPath(parsed.target)
    if (path === '/__gw__/login') {
      handleLogin(socket, parsed, buffer.subarray(parsed.headBytes))
      return
    }

    // Token gate (--no-auth bypasses entirely).
    if (!opts.noAuth && !isAuthed(parsed)) {
      respondLogin(socket, opts.name, path === '/' ? '/' : path)
      return
    }

    // Proxy: rewrite the head, connect to the loopback target, stream both ways.
    const [targetHost, targetPortRaw] = opts.target.split(':')
    const targetPort = Number(targetPortRaw)
    const target = netConnect(targetPort, targetHost)
    const rest = buffer.subarray(parsed.headBytes)
    let connected = false
    target.on('connect', () => {
      connected = true
      target.write(rewriteHead(parsed, targetPort))
      if (rest.length > 0) target.write(rest)
      proxying = true
      socket.pipe(target)
      target.pipe(socket)
    })
    target.on('error', (error) => {
      if (!connected) {
        respondPlain(socket, 502, `cannot reach target ${targetHost}:${targetPort}: ${error.message}`)
      }
      socket.destroy()
    })
    socket.on('error', () => target.destroy())
    socket.on('close', () => { if (proxying) target.destroy() })
  }

  socket.on('data', onData)
  socket.on('error', () => { socket.destroy() })
}

/** Whether the request carries a valid token: session cookie, Bearer header,
 * or ?token= query parameter. */
function isAuthed(parsed) {
  const cookie = parsed.map.cookie ?? ''
  const session = /(?:^|;\s*)dsh_gw_session=([^;]+)/.exec(cookie)
  if (session !== null && verifySession(session[1])) return true
  const bearer = parsed.map.authorization ?? ''
  if (bearer.startsWith('Bearer ') && bearer.slice(7) === opts.token) return true
  try {
    return new URL(parsed.target, 'http://gateway.local').searchParams.get('token') === opts.token
  } catch {
    return false
  }
}

/** Login POST: verify the token (rate-limited), mint the session cookie. */
function handleLogin(socket, parsed, initialBody) {
  const path = targetPath(parsed.target)
  let next = '/'
  try {
    next = new URL(parsed.target, 'http://gateway.local').searchParams.get('next') ?? '/'
  } catch { /* keep default */ }
  if (!/^\/(?!\/)/.test(next)) next = '/'

  if (parsed.method !== 'POST') {
    respondLogin(socket, opts.name, next)
    return
  }

  const ip = socket.remoteAddress ?? 'unknown'
  if (isBlocked(ip)) {
    respondPlain(socket, 429, 'too many login attempts, try again later')
    return
  }

  const contentLength = Number(parsed.map['content-length'] ?? 0)
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 16384) {
    respondPlain(socket, 413, 'login body too large')
    return
  }

  let collected = Buffer.from(initialBody ?? [])
  const done = () => {
    socket.off('data', onBody)
    const token = new URLSearchParams(collected.toString('utf8')).get('token') ?? ''
    if (token === opts.token) {
      const cookie = `dsh_gw_session=${signSession(Date.now() + opts.maxAgeHours * 3600_000)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${opts.maxAgeHours * 3600}`
      socket.write(
        'HTTP/1.1 302 Found\r\n'
        + `location: ${next}\r\n`
        + `set-cookie: ${cookie}\r\n`
        + 'content-length: 0\r\n'
        + 'connection: close\r\n\r\n',
      )
      socket.end()
      log(`login ok from ${ip}`)
    } else {
      registerFailure(ip)
      log(`login FAILED from ${ip}`)
      respondLogin(socket, opts.name, next)
    }
  }
  const onBody = (chunk) => {
    collected = Buffer.concat([collected, chunk])
    if (collected.length >= contentLength) done()
  }
  if (collected.length >= contentLength) {
    done()
  } else {
    socket.on('data', onBody)
    socket.once('end', done)
  }
}

/* ------------------------------------------------------------------ */
/* Entry.                                                             */
/* ------------------------------------------------------------------ */

const opts = parseArgs(process.argv.slice(2))

const [targetHost, targetPortRaw] = opts.target.split(':')
const defaultListenPort = Number(targetPortRaw) + 5000
const [listenHostRaw, listenPortRaw] = (opts.listen ?? `0.0.0.0:${defaultListenPort}`).split(':')
const listenHost = listenHostRaw ?? '0.0.0.0'
const listenPort = Number(listenPortRaw)

const server = opts.tlsCert !== null
  ? createTlsServer({ cert: readFileSync(opts.tlsCert), key: readFileSync(opts.tlsKey) }, handleSocket)
  : createNetServer(handleSocket)

server.on('error', (error) => {
  process.stderr.write(`[gateway] cannot listen on ${listenHost}:${listenPort}: ${error.message}\n`)
  if (error.code === 'EACCES' || error.code === 'EADDRINUSE') {
    process.stderr.write('[gateway] hint: the port may fall in a Windows excluded range (check `netsh interface ipv4 show excludedportrange protocol=tcp`) or is already in use — pick another --listen port.\n')
  }
  process.exit(1)
})

server.listen(listenPort, listenHost, () => {
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : listenPort
  const scheme = opts.tlsCert !== null ? 'https' : 'http'
  log(`target ${opts.target} (${opts.name})`)
  log(`listening ${scheme}://${listenHost}:${port} — auth ${opts.noAuth ? 'DISABLED (trusted network only)' : `token required (cookie ${opts.maxAgeHours}h)`}`)
  if (!opts.noAuth) {
    const hosts = lanAddresses()
    const urls = hosts.length > 0 ? hosts.map(ip => `${scheme}://${ip}:${port}/`) : [`${scheme}://localhost:${port}/`]
    log(`phone / remote access:\n  ${urls.join('\n  ')}`)
    log(`token: ${opts.token}`)
  }
})

process.on('SIGINT', () => { server.close(() => process.exit(0)) })
process.on('SIGTERM', () => { server.close(() => process.exit(0)) })
