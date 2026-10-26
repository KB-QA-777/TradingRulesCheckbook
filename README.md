# Trading Rules Checkbook

A pre-trade checklist that keeps you honest. Define your strategies and their rules, then tick off each rule before you enter a trade. A readiness bar fills as rules are met and only says **"100% met — you can take the trade"** when every rule is satisfied.

## Features

- **Strategies & Rules** – add, rename, describe and delete strategies; add, edit, reorder and delete each strategy's rules.
- **Take a Trade** – pick one or more strategies, tick the rules you've met, and watch the readiness bar:
  - 🟢 100% → you can take the trade
  - 🟡 70–99% → wait, not all rules are met (missing rules are listed)
  - 🔴 below 70% → do not take the trade
- **Screenshots** – attach chart screenshots to a trade: click to pick files, drag & drop, or paste straight from the clipboard (Ctrl+V). Large images are downscaled automatically.
- **Trade Log** – log the trade with symbol, direction, time, notes and screenshots. The log shows screenshot thumbnails and a discipline score (share of trades taken with all rules met).
- **Trade detail page** – click any trade (or its **View →** link) to open its own page: date and time, strategies, every rule with ✓/✗, notes (editable), and full-size screenshots. You can add more screenshots later. Each trade has its own link (`index.html#trade-<id>`) you can bookmark or copy.
- **Export / Import** – back up your strategies, log and screenshots as one JSON file.

Everything is stored in your browser (local storage for data, IndexedDB for screenshots); no server or account needed.

## Running

No build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```
