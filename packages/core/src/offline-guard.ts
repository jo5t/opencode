/**
 * Offline build: blocks every network request to a non-local host, process-wide.
 *
 * Imported for side effects as the FIRST import of every entry realm
 * (CLI main, TUI server worker). Workers have their own JS realm and must
 * import this themselves — a main-thread patch does not reach them.
 *
 * Allowed: loopback, RFC1918/link-local/ULA ranges, dotless hostnames
 * (Docker service names, mDNS-style single labels), common local TLDs,
 * and anything listed in OPENCODE_ALLOW_HOSTS (comma-separated).
 * Everything else is rejected before any DNS lookup happens.
 */

// ponytail: covers fetch/WebSocket/EventSource (all Bun/JS egress in this repo).
// Raw node:http users (aws-sdk credential chains, arborist) are not patched —
// arborist is disabled in npm.ts and the Docker network blocks the rest.

const extraHosts = (process.env["OPENCODE_ALLOW_HOSTS"] ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean)

const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".home.arpa"]

export function isAllowedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase()
  if (!host) return false
  if (extraHosts.some((allowed) => host === allowed || host.endsWith("." + allowed))) return true
  if (host === "localhost") return true
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    return false
  }
  if (host.includes(":")) {
    // IPv6 literal: loopback, link-local, ULA. IPv4-mapped (::ffff:x) falls through → blocked.
    return host === "::1" || host === "::" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")
  }
  // Dotless hostname → only resolvable via local DNS (Docker service names, /etc/hosts).
  if (!host.includes(".")) return true
  return false
}

export class OfflineBlockedError extends Error {
  constructor(host: string) {
    super(
      `offline build: request to non-local host "${host}" blocked. ` +
        `Allowed are loopback/private addresses and local hostnames; extend via OPENCODE_ALLOW_HOSTS.`,
    )
    this.name = "OfflineBlockedError"
  }
}

function hostOf(input: string | URL | Request): string {
  if (typeof input === "object" && "url" in input) return new URL(input.url).hostname
  return new URL(String(input)).hostname
}

const realFetch = globalThis.fetch
const guardedFetch = function fetch(input: string | URL | Request, init?: RequestInit) {
  let host: string
  try {
    host = hostOf(input)
  } catch {
    // Relative/unparseable URL — cannot name an external host, let the runtime handle it.
    return realFetch(input as any, init)
  }
  if (!isAllowedHost(host)) return Promise.reject(new OfflineBlockedError(host))
  return realFetch(input as any, init)
}
Object.assign(guardedFetch, realFetch) // keep Bun extras like fetch.preconnect
globalThis.fetch = guardedFetch as typeof fetch

const RealWebSocket = globalThis.WebSocket
if (RealWebSocket) {
  globalThis.WebSocket = class WebSocket extends RealWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const host = new URL(String(url)).hostname
      if (!isAllowedHost(host)) throw new OfflineBlockedError(host)
      super(url, protocols)
    }
  } as typeof globalThis.WebSocket
}

const RealEventSource = (globalThis as any).EventSource
if (RealEventSource) {
  ;(globalThis as any).EventSource = class EventSource extends RealEventSource {
    constructor(url: string | URL, init?: unknown) {
      const host = new URL(String(url)).hostname
      if (!isAllowedHost(host)) throw new OfflineBlockedError(host)
      super(url, init)
    }
  }
}
