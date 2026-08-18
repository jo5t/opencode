# opencode — Offline-Build fürs Homelab

Dieser Fork ist so umgebaut, dass opencode **keine Daten mit externen Diensten
teilt und nicht mit dem Internet kommunizieren kann**. Drei Verteidigungslinien:

1. **Features entfernt** (im Code, nicht nur per Flag):
   - Session-Sharing (`/share` lud kompletten Sitzungsinhalt zu opncd.ai hoch)
   - Update-Check + Selbst-Update (opencode.ai, npm, brew, choco, scoop, GitHub)
   - Modellkatalog-Fetch (models.opencode.ai) — nur noch lokale Datei/Snapshot
   - npm-Paketinstallation zur Laufzeit (registry.npmjs.org via arborist)
   - `webfetch`/`websearch`-Tools (das LLM kann keine URLs mehr abrufen)
   - Tree-sitter-Grammatik-Downloads des TUI (github.com, pro Sprache)
2. **Globale Netzsperre** (`packages/core/src/offline-guard.ts`): patcht
   `fetch`/`WebSocket`/`EventSource` prozessweit. Erlaubt sind nur Loopback,
   private IP-Bereiche (RFC1918, Link-Local, ULA), Hostnamen ohne Punkt
   (Docker-Servicenamen) und lokale Endungen (`.local`, `.lan`, `.internal`,
   `.home`, `.home.arpa`, `.localhost`). Alles andere wird vor dem DNS-Lookup
   abgelehnt. Erweiterbar per `OPENCODE_ALLOW_HOSTS=fritz.box,mein-nas.xyz`.
3. **Docker-Netz `internal: true`** (compose.yml): der opencode-Container hat
   keine Route ins Internet — egal was der Code (oder ein gespawnter Prozess
   wie `git clone`) versucht.

## Variante A: alles auf einem Host (opencode + Ollama)

```bash
cd offline

# 1. Stack bauen (braucht EINMALIG Internet: Image, Dependencies, Katalog-Snapshot)
docker compose build

# 2. Ollama-Modell ziehen (Ollama hängt zusätzlich im egress-Netz, opencode nicht)
docker compose up -d ollama
docker compose exec ollama ollama pull qwen3:14b

# 3. opencode-TUI starten (interaktiv)
OPENCODE_WORKSPACE=/pfad/zu/deinem/projekt docker compose run --rm opencode
```

Modell ändern: in `opencode.json` unter `models` eintragen und `model` anpassen
(Format `ollama/<modellname>`), dann `ollama pull <modellname>`.

## Variante B: opencode auf dem Laptop, LLM via OpenWebUI auf dem Homelab

Hier läuft nur der opencode-Container lokal; das Modell wird über die
OpenAI-kompatible API von OpenWebUI (`http://<homelab>:8080/api`) angesprochen.
Kein `internal`-Netz — der Container muss das Homelab im LAN erreichen. Den
Internet-Schutz übernimmt die Code-Sperre (private IPs erlaubt, Rest geblockt).

```bash
cd offline
cp .env.example .env        # URL + API-Key eintragen (.env ist gitignored)
docker compose -f compose.laptop.yml build
OPENCODE_WORKSPACE=/pfad/zu/deinem/projekt docker compose -f compose.laptop.yml run --rm opencode
```

Modell ändern: in `opencode.laptop.json` den Model-Key auf die ID setzen, die
OpenWebUI anzeigt, und `model` (Format `openwebui/<id>`) anpassen. Erreichst du
das Homelab über einen Hostnamen mit Punkt (z.B. `nas.fritz.box`), trage die
Domain in `.env` unter `OPENCODE_ALLOW_HOSTS` ein.

### NuGet-Pakete einmalig vorladen (danach keine Downloads zur Laufzeit)

Alles Externe passiert beim Image-Bau bzw. in diesem einmaligen Setup-Schritt.
Pro Projekt einmal ausführen — die Pakete landen im persistenten
`opencode-home`-Volume (`/root/.nuget`):

```bash
OPENCODE_WORKSPACE=/pfad/zum/projekt \
  docker compose -f compose.laptop.yml run --rm --entrypoint dotnet opencode restore
```

Danach bedient sich jeder `dotnet build`/`restore`/`test` aus dem Cache, ohne
nuget.org zu kontaktieren (Voraussetzung: feste Paketversionen, keine
Floating-Versions wie `1.*`). Dasselbe Muster gilt für npm-Projekte
(`--entrypoint bun opencode install`).

## Updates

`opencode upgrade` ist deaktiviert. Aktualisieren = Upstream-Änderungen per
`git pull`/`git merge` holen, Diff auf neue Netzwerkzugriffe prüfen, Image neu
bauen.

## Bewusste Einschränkungen

- **Syntax-Highlighting** im TUI nur für JavaScript, TypeScript, Markdown, Zig
  (die eingebauten opentui-Parser). Andere Sprachen: Text ohne Highlighting.
- **LSP-Server** werden nicht mehr automatisch heruntergeladen. Wer LSP will,
  installiert den Server ins Image und trägt ihn in der Config ein.
- **`opencode web`** (Browser-UI) funktioniert im Source-Betrieb nicht — das
  UI-Bundle wird nur beim Binary-Build eingebettet, und der Fallback (Proxy zu
  app.opencode.ai) ist durch die Netzsperre blockiert. Das TUI ist der Weg.
- **Cloud-Kommandos** (`opencode login`, `opencode github`, Provider-OAuth wie
  Copilot/Codex) schlagen mit einer klaren Fehlermeldung der Netzsperre fehl.
  Der Code dafür ist noch da, kann aber nicht mehr nach außen sprechen.
- Eigene Plugins mit npm-Dependencies müssen ihre `node_modules` mitbringen —
  es wird nichts mehr nachinstalliert.
