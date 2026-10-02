#!/usr/bin/env bash
# sharpen installer — detects your agent CLIs and installs the skill into each.
# Usage:  curl -fsSL https://raw.githubusercontent.com/APareek89/sharpen/main/install.sh | bash
set -euo pipefail

REPO="https://github.com/APareek89/sharpen"
SRC=""
CLEANUP=""

# Run from a checkout if we're inside one, else shallow-clone to a temp dir.
if [ -f "$(dirname "$0")/skills/sharpen/SKILL.md" ] 2>/dev/null; then
  SRC="$(cd "$(dirname "$0")" && pwd)"
else
  SRC="$(mktemp -d)"
  CLEANUP="$SRC"
  echo "Fetching $REPO …"
  git clone --depth 1 --quiet "$REPO" "$SRC"
fi

SKILL="$SRC/skills/sharpen"
installed=0

install_to () {
  local dest="$1" label="$2"
  # Preserve the user's saved custom personas across updates.
  local keep=""
  if [ -d "$dest/personas/custom" ]; then
    keep="$(mktemp -d)"
    cp -R "$dest/personas/custom/." "$keep/"
  fi
  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  cp -R "$SKILL" "$dest"
  if [ -n "$keep" ]; then
    mkdir -p "$dest/personas/custom"
    cp -R "$keep/." "$dest/personas/custom/"
    rm -rf "$keep"
  fi
  echo "✂️  installed → $label ($dest)"
  installed=1
}

# Claude Code
if [ -d "$HOME/.claude" ]; then
  install_to "$HOME/.claude/skills/sharpen" "Claude Code"
fi

# OpenAI Codex (native skills folder — same SKILL.md format)
if [ -d "$HOME/.codex" ]; then
  install_to "$HOME/.codex/skills/sharpen" "Codex"
  # Remove any older single-file prompt install to avoid a duplicate /sharpen.
  rm -f "$HOME/.codex/prompts/sharpen.md" 2>/dev/null || true
fi

# opencode
if [ -d "$HOME/.config/opencode" ]; then
  install_to "$HOME/.config/opencode/skills/sharpen" "opencode"
fi

if [ "$installed" -eq 0 ]; then
  echo "No agent home detected (~/.claude, ~/.codex, ~/.config/opencode)."
  echo "Manual install: copy skills/sharpen/ into your agent's skills directory,"
  echo "or paste skills/sharpen/SKILL.md into your agent's instructions (AGENTS.md,"
  echo "Cursor rules, custom GPT). It is self-sufficient as a single file."
  exit 1
fi

[ -n "$CLEANUP" ] && rm -rf "$CLEANUP"
echo "Done. Invoke with /sharpen (or say \"sharpen this\")."
