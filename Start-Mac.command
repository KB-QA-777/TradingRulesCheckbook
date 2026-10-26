#!/bin/bash
# Opens Trading Rules Checkbook in its own app window (Chrome, Edge, Brave or
# Chromium), or in the default browser if none of those is installed.
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="file://${DIR// /%20}/index.html"

for app in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
  if open -Ra "$app" 2>/dev/null; then
    open -na "$app" --args --app="$URL"
    exit 0
  fi
done

open "$DIR/index.html"
