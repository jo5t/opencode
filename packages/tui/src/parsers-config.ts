// Offline build: the upstream list pointed every entry at github.com /
// raw.githubusercontent.com — the opentui parser worker downloads grammar WASM
// and highlight queries on first render of a file, from its own worker realm
// (not covered by the fetch guard). Empty list = only the opentui built-in
// parsers (javascript, typescript, markdown, zig); other languages render
// without syntax highlighting.
export default {
  parsers: [],
}
