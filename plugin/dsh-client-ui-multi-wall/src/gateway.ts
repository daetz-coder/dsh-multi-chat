/**
 * Inline authenticated gateway for the multi-wall plugin's node half.
 *
 * The official `dsh web` CLI forbids `--host 0.0.0.0` (it would expose remote
 * code execution to the network), so reaching a loopback-only DSH instance
 * from a phone/another machine needs an auth-gated gateway in front of it.
 *
 * This module embeds that gateway directly in the plugin (no external
 * `gateway.mjs` file needed at runtime): a raw TCP listener that authenticates
 * a token (HMAC-signed session cookie), then transparently proxies to
 * `127.0.0.1:<target-port>`, rewriting Host/Origin so the official `/api`
 * browser-trust fence treats it as a local request. WebSocket upgrades pass
 * through untouched because the socket is piped byte-for-byte after the head.
 *
 * Zero dependencies: node:net + node:crypto only.
 * @module @deepseek-ai/dsh-client-ui-multi-wall/gateway
 */

import { connect as netConnect } from 'node:net'
import { createServer, type Server, type Socket } from 'node:net'
import { createHmac, timingSafeEqual } from 'node:crypto'

/** One parsed HTTP/1.1 request head. */
interface ParsedHead {
  malformed: boolean
  headBytes: number
  method: string
  target: string
  version: string
  headers: Array<[string, string]>
  map: Record<string, string>
}

/** Options for {@link startGateway}. */
export interface GatewayOptions {
  /** Loopback target port (the DSH instance to proxy). */
  targetPort: number
  /** Listen port; pass 0 to let the OS pick one. */
  port: number
  /** Login token (secret). */
  token: string
  /** Instance label shown on the login page. */
  name: string
  /** Session cookie lifetime in hours. */
  maxAgeHours?: number
  /** Log lines (startup, login events). */
  log?: (message: string) => void
}

/** Handle returned by {@link startGateway}. */
export interface GatewayHandle {
  /** The OS-assigned listen port (equals `port` unless it was 0). */
  port: number
  /** The login token. */
  token: string
  /** Close the gateway listener. */
  close: () => void
}

/** Constant-time hex string comparison (length-guarded). */
function safeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex')
  const b = Buffer.from(right, 'hex')
  return a.length !== 0 && a.length === b.length && timingSafeEqual(a, b)
}

/** Minimal HTTP/1.1 head parse; null until the head is complete. */
function parseHead(buffer: Buffer): ParsedHead | null {
  const idx = buffer.indexOf('\r\n\r\n')
  if (idx === -1) return null
  const head = buffer.subarray(0, idx + 4).toString('latin1')
  const lines = head.split('\r\n')
  const requestLine = lines[0]?.match(/^(\S+)\s+(\S+)\s+(HTTP\/\d\.\d)$/)
  const headers: Array<[string, string]> = []
  const map: Record<string, string> = {}
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

/** Pathname of a request target (defaults to '/' on parse failure). */
function targetPath(target: string): string {
  try {
    return new URL(target, 'http://gateway.local').pathname
  } catch {
    return '/'
  }
}

/** The dark-themed login page. */
function loginPage(name: string, next: string): string {
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
  <label for="token">访问口令</label>
  <input id="token" name="token" type="password" autofocus autocomplete="current-password">
  <input type="hidden" name="next" value="${nxt}">
  <button type="submit">进入</button>
</form>
</body>
</html>`
}

/** Send the login page as a 401 HTML response. */
function respondLogin(socket: Socket, name: string, next: string): void {
  const body = Buffer.from(loginPage(name, next), 'utf8')
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

/** Send a small plain-text response and close the socket. */
function respondPlain(socket: Socket, status: string, text: string): void {
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

/**
 * Rebuild the request head for the loopback target. Host and Origin point at
 * `127.0.0.1:<target-port>` so the DSH `/api` browser-trust fence sees a local
 * request. Non-upgrade requests get `connection: close` (fresh connection per
 * request keeps keep-alive from smuggling unrewritten Host headers); upgrades
 * (WebSocket) keep `connection: Upgrade`.
 */
function rewriteHead(parsed: ParsedHead, targetPort: number): string {
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

/**
 * Start an in-process authenticated gateway for one loopback DSH instance.
 * @param options - target, listen port, token, label, and lifetime.
 * @returns a handle with the assigned port and token, and a close().
 */
export function startGateway(options: GatewayOptions): Promise<GatewayHandle> {
  const {
    targetPort,
    port: requestedPort,
    token,
    name,
    maxAgeHours = 12,
    log = () => {},
  } = options

  const hmac = (data: string) => createHmac('sha256', token).update(data).digest('hex')
  const signSession = (exp: number) => {
    const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url')
    return `${payload}.${hmac(payload)}`
  }
  const verifySession = (value: string) => {
    const dot = value.lastIndexOf('.')
    if (dot <= 0) return false
    const payload = value.slice(0, dot)
    const sig = value.slice(dot + 1)
    if (!safeEqualHex(sig, hmac(payload))) return false
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: unknown }
      return typeof parsed.exp === 'number' && parsed.exp > Date.now()
    } catch {
      return false
    }
  }

  const isAuthed = (parsed: ParsedHead): boolean => {
    const cookie = parsed.map.cookie ?? ''
    const session = /(?:^|;\s*)dsh_gw_session=([^;]+)/.exec(cookie)
    if (session !== null && verifySession(session[1] ?? '')) return true
    const bearer = parsed.map.authorization ?? ''
    if (bearer.startsWith('Bearer ') && bearer.slice(7) === token) return true
    try {
      return new URL(parsed.target, 'http://gateway.local').searchParams.get('token') === token
    } catch {
      return false
    }
  }

  // Rate limiting per source IP (login POST only).
  const attempts = new Map<string, { fails: number; blockedUntil?: number }>()
  const isBlocked = (ip: string) => {
    const entry = attempts.get(ip)
    return entry !== undefined && entry.blockedUntil !== undefined && entry.blockedUntil > Date.now()
  }
  const registerFailure = (ip: string) => {
    const now = Date.now()
    const entry = attempts.get(ip) ?? { fails: 0 }
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

  const handleLogin = (socket: Socket, parsed: ParsedHead, initialBody: Buffer): void => {
    let next = '/'
    try {
      next = new URL(parsed.target, 'http://gateway.local').searchParams.get('next') ?? '/'
    } catch { /* keep default */ }
    if (!/^\/(?!\/)/.test(next)) next = '/'

    if (parsed.method !== 'POST') {
      respondLogin(socket, name, next)
      return
    }
    const ip = socket.remoteAddress ?? 'unknown'
    if (isBlocked(ip)) {
      respondPlain(socket, '429', 'too many login attempts, try again later')
      return
    }
    const contentLength = Number(parsed.map['content-length'] ?? 0)
    if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 16384) {
      respondPlain(socket, '413', 'login body too large')
      return
    }

    let collected = Buffer.from(initialBody)
    const done = () => {
      socket.off('data', onBody)
      const submitted = new URLSearchParams(collected.toString('utf8')).get('token') ?? ''
      if (submitted === token) {
        const cookie = `dsh_gw_session=${signSession(Date.now() + maxAgeHours * 3600_000)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeHours * 3600}`
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
        respondLogin(socket, name, next)
      }
    }
    const onBody = (chunk: Buffer) => {
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

  const handleSocket = (socket: Socket): void => {
    let buffer: Buffer = Buffer.alloc(0)
    let headDone = false
    let proxying = false

    const onData = (chunk: Buffer) => {
      if (headDone) return
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
      if (buffer.length > 65536) {
        headDone = true
        respondPlain(socket, '431', 'request head too large')
        return
      }
      const parsed = parseHead(buffer)
      if (parsed === null) return

      headDone = true
      if (parsed.malformed) {
        respondPlain(socket, '400', 'malformed request')
        return
      }

      const path = targetPath(parsed.target)
      if (path === '/__gw__/login') {
        handleLogin(socket, parsed, buffer.subarray(parsed.headBytes))
        return
      }

      if (!isAuthed(parsed)) {
        respondLogin(socket, name, path === '/' ? '/' : path)
        return
      }

      const target = netConnect(targetPort, '127.0.0.1')
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
      target.on('error', (error: NodeJS.ErrnoException) => {
        if (!connected) {
          respondPlain(socket, '502', `cannot reach target 127.0.0.1:${targetPort}: ${error.message}`)
        }
        socket.destroy()
      })
      socket.on('error', () => target.destroy())
      socket.on('close', () => { if (proxying) target.destroy() })
    }

    socket.on('data', onData)
    socket.on('error', () => { socket.destroy() })
  }

  return new Promise((resolve, reject) => {
    const server: Server = createServer(handleSocket)
    server.once('error', reject)
    server.listen(requestedPort, '0.0.0.0', () => {
      server.removeListener('error', reject)
      const address = server.address()
      const assignedPort = typeof address === 'object' && address !== null ? address.port : requestedPort
      log(`gateway listening 0.0.0.0:${assignedPort} -> 127.0.0.1:${targetPort}`)
      resolve({
        port: assignedPort,
        token,
        close: () => { server.close() },
      })
    })
  })
}
