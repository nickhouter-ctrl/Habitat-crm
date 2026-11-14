#!/bin/zsh
# Donderdagochtend (launchd): wekelijkse social-content laten maken door Claude Code.
# Leest de vaste sleutel uit ~/.config/habitat/claude-token (alleen leesbaar voor Nick).
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$HOME/Library/Logs/habitat-social-weekly.log"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
TOKEN_FILE="$HOME/.config/habitat/claude-token"
if [[ ! -s "$TOKEN_FILE" ]]; then
  echo "$(date) geen sleutel in $TOKEN_FILE" >> "$LOG"; exit 1
fi
export CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
mkdir -p "$HOME/Library/Application Support/habitat-social"
cd "$REPO" || exit 1
echo "===== $(date) start in $REPO" >> "$LOG"
claude -p "$(cat scripts/social-studio/weekly-prompt.md)" \
  --allowedTools "Bash Read Write Edit Glob Grep mcp__higgsfield__balance mcp__higgsfield__media_upload mcp__higgsfield__media_confirm mcp__higgsfield__generate_video mcp__higgsfield__jobs_wait" \
  < /dev/null >> "$LOG" 2>&1
echo "===== $(date) klaar (exit $?)" >> "$LOG"
