#!/bin/sh
# Opens Trading Rules Checkbook in its own app window (Chrome, Chromium, Edge
# or Brave), or in the default browser if none of those is installed.
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="file://$(printf '%s' "$DIR" | sed 's/ /%20/g')/index.html"

for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser; do
  if command -v "$b" >/dev/null 2>&1; then
    "$b" --app="$URL" >/dev/null 2>&1 &
    exit 0
  fi
done

xdg-open "$DIR/index.html" >/dev/null 2>&1 &
