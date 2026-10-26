#!/bin/sh
# Rebuilds ../TradingRulesCheckbook.exe with the current app files bundled in.
# Needs Go (https://go.dev/dl/). Run from anywhere: sh windows/build.sh
set -e
cd "$(dirname "$0")"
rm -rf app && mkdir app
cp ../index.html ../app.js ../styles.css ../icon.svg app/
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H=windowsgui" -o ../TradingRulesCheckbook.exe .
rm -rf app
echo "Built TradingRulesCheckbook.exe"
