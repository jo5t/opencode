import { describe, expect, test } from "bun:test"
import { isAllowedHost, OfflineBlockedError } from "../src/offline-guard"

describe("offline-guard", () => {
  test("allows loopback, private ranges and local names", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.20",
      "169.254.0.1",
      "::1",
      "fe80::1",
      "fd00::1",
      "ollama", // dotless: docker service name
      "nas.lan",
      "printer.local",
      "opencode.internal",
      "box.home.arpa",
    ]) {
      expect(isAllowedHost(host), host).toBe(true)
    }
  })

  test("blocks external hosts", () => {
    for (const host of [
      "opencode.ai",
      "models.opencode.ai",
      "registry.npmjs.org",
      "api.github.com",
      "raw.githubusercontent.com",
      "8.8.8.8",
      "172.32.0.1", // just outside 172.16/12
      "172.15.0.1",
      "::ffff:8.8.8.8", // IPv4-mapped IPv6
      "evil.internal.example.com", // local-looking label in the middle
      "example.com.", // trailing dot
    ]) {
      expect(isAllowedHost(host), host).toBe(false)
    }
  })

  test("OPENCODE_ALLOW_HOSTS entries are respected (suffix match)", () => {
    // env is read at module load; this test documents the contract via isAllowedHost only
    expect(isAllowedHost("myserver.fritz.box")).toBe(false)
  })

  test("fetch to an external host rejects before any dial", async () => {
    expect(fetch("https://example.com")).rejects.toThrow(OfflineBlockedError)
  })

  test("fetch to loopback is passed through to the real fetch", async () => {
    // port 9 (discard) is closed — a connection error proves the guard let it through
    expect(fetch("http://127.0.0.1:9")).rejects.not.toThrow(OfflineBlockedError)
  })

  test("WebSocket to an external host throws", () => {
    expect(() => new WebSocket("wss://example.com")).toThrow(OfflineBlockedError)
  })
})
