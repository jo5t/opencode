FROM oven/bun:1.3

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ripgrep ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opencode
COPY . .

# --ignore-scripts: überspringt kaputte native Postinstalls (tree-sitter-powershell,
# node-gyp) — zur Laufzeit wird davon nichts gebraucht. node-pty braucht nur ein chmod:
RUN bun install --frozen-lockfile --ignore-scripts \
    && bun run --cwd packages/core fix-node-pty

# Modellkatalog-Snapshot zur BUILD-Zeit (online erlaubt). Zur Laufzeit fetcht der
# Code den Katalog nie — er liest nur diese Datei (OPENCODE_MODELS_PATH).
RUN bun -e "const r = await fetch('https://models.opencode.ai/api.json'); if (!r.ok) throw new Error('catalog fetch failed: ' + r.status); await Bun.write('/opencode/models.json', await r.text())"

# Gürtel zu den Hosenträgern: die Features sind im Code bereits entfernt,
# die Flags schaden aber nicht.
ENV OPENCODE_MODELS_PATH=/opencode/models.json \
    OPENCODE_DISABLE_AUTOUPDATE=1 \
    OPENCODE_DISABLE_SHARE=1 \
    OPENCODE_DISABLE_MODELS_FETCH=1

WORKDIR /workspace
ENTRYPOINT ["bun", "--conditions=browser", "/opencode/packages/opencode/src/index.ts"]
