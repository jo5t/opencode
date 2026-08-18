import fs from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { Npm } from "@opencode-ai/core/npm"
import { tmpdir } from "./fixture/tmpdir"

const win = process.platform === "win32"

const writePackage = (dir: string, pkg: Record<string, unknown>) =>
  Bun.write(
    path.join(dir, "package.json"),
    JSON.stringify({
      version: "1.0.0",
      ...pkg,
    }),
  )

const npmLayer = (cache: string) =>
  AppNodeBuilder.build(Npm.node, [[Global.node, Global.layerWith({ cache, state: path.join(cache, "state") })]])

describe("Npm.sanitize", () => {
  test("keeps normal scoped package specs unchanged", () => {
    expect(Npm.sanitize("@opencode/acme")).toBe("@opencode/acme")
    expect(Npm.sanitize("@opencode/acme@1.0.0")).toBe("@opencode/acme@1.0.0")
    expect(Npm.sanitize("prettier")).toBe("prettier")
  })

  test("handles git https specs", () => {
    const spec = "acme@git+https://github.com/opencode/acme.git"
    const expected = win ? "acme@git+https_//github.com/opencode/acme.git" : spec
    expect(Npm.sanitize(spec)).toBe(expected)
  })
})

// Offline build: runtime installs are removed — `add` only resolves pre-seeded
// packages from the cache and fails otherwise, `install` is a no-op.
describe("Npm.add", () => {
  test("resolves a pre-seeded package from the cache without installing", async () => {
    await using tmp = await tmpdir()
    const spec = "fixture-provider"
    const pkgDir = path.join(tmp.path, "cache", "packages", Npm.sanitize(spec), "node_modules", "fixture-provider")
    await fs.mkdir(pkgDir, { recursive: true })
    await writePackage(pkgDir, { name: "fixture-provider", main: "index.js" })
    await Bun.write(path.join(pkgDir, "index.js"), "export const fixture = true\n")

    const entry = await Effect.gen(function* () {
      const npm = yield* Npm.Service
      return yield* npm.add(spec)
    }).pipe(Effect.scoped, Effect.provide(npmLayer(path.join(tmp.path, "cache"))), Effect.runPromise)

    expect(entry.entrypoint).toBeDefined()
  })

  test("fails clearly when the package is not pre-seeded", async () => {
    await using tmp = await tmpdir()

    const exit = await Effect.gen(function* () {
      const npm = yield* Npm.Service
      return yield* npm.add("fixture-not-cached")
    }).pipe(Effect.scoped, Effect.provide(npmLayer(path.join(tmp.path, "cache"))), Effect.exit, Effect.runPromise)

    expect(Exit.isFailure(exit)).toBe(true)
  })
})

describe("Npm.install", () => {
  test("is a no-op and never creates node_modules", async () => {
    await using tmp = await tmpdir()

    await writePackage(tmp.path, {
      name: "fixture",
      dependencies: {
        "prod-pkg": "file:./prod-pkg",
      },
    })
    await fs.mkdir(path.join(tmp.path, "prod-pkg"))
    await writePackage(path.join(tmp.path, "prod-pkg"), { name: "prod-pkg" })

    await Npm.install(tmp.path)

    await expect(fs.stat(path.join(tmp.path, "node_modules"))).rejects.toThrow()
  })
})
