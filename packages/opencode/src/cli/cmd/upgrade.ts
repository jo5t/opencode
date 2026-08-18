import type { Argv } from "yargs"
import { UI } from "../ui"

// Offline build: self-update contacted opencode.ai, npm, brew, choco, scoop and
// GitHub, and piped a downloaded install script into a shell — removed.
export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "disabled in this offline build",
  builder: (yargs: Argv) => yargs,
  handler: async () => {
    UI.error("upgrade is disabled in this offline build — update via git pull + rebuild of the image")
    process.exitCode = 1
  },
}
