# Trading Rules Checkbook

A pre-trade checklist that keeps you honest. Define your strategies and their rules, then tick off each rule before you enter a trade. A readiness bar fills as rules are met and only says **"100% met — you can take the trade"** when every rule is satisfied.

## Features

- **Strategies & Rules** – add, rename, describe and delete strategies; add, edit, reorder and delete each strategy's rules.
- **Long / Short rules** – mark each rule as *Both*, *Long only* or *Short only*. When you take a trade, the checklist shows only the rules for the direction you picked.
- **Symbol dropdown** – pick from metals (XAUUSD, XAGUSD…), major forex pairs, forex crosses, indices (US30, NAS100, GER40, NIFTY50, BANKNIFTY…), crypto (BTCUSD, ETHUSD…) and energy. Use *Custom symbol…* to add anything else; it's saved under *My symbols*.
- **Take a Trade** – pick a symbol and Long/Short, then one or more strategies, tick the rules you've met, and watch the readiness bar:
  - 🟢 100% → you can take the trade
  - 🟡 70–99% → wait, not all rules are met (missing rules are listed)
  - 🔴 below 70% → do not take the trade
- **Screenshots** – attach chart screenshots to a trade: click to pick files, drag & drop, or paste straight from the clipboard (Ctrl+V). Large images are downscaled automatically.
- **Trade Log** – log the trade with symbol, direction, time, notes and screenshots. The log shows screenshot thumbnails and a discipline score (share of trades taken with all rules met).
- **Trade detail page** – click any trade (or its **View →** link) to open its own page: date and time, strategies, every rule with ✓/✗, notes (editable), and full-size screenshots. You can add more screenshots later. Each trade has its own link (`index.html#trade-<id>`) you can bookmark or copy.
- **Export / Import** – back up your strategies, log and screenshots as one JSON file.

Everything is stored in your browser (local storage for data, IndexedDB for screenshots); no server or account needed.

## Open it (one click)

```sh
git clone https://github.com/KB-QA-777/TradingRulesCheckbook.git
```

**Windows:** double-click **`TradingRulesCheckbook.exe`**. That's it.
You can also copy the exe anywhere (e.g. your Desktop) — it carries the app inside it and works on its own.

**macOS / Linux:** double-click the launcher in the cloned folder:

| System  | Double-click            |
|---------|-------------------------|
| macOS   | `Start-Mac.command`     |
| Linux   | `start-linux.sh`        |

(`Start-Windows.bat` is also kept as a Windows alternative to the exe.)

The exe and launchers open the checkbook in its own app window (no tabs or address bar) using Chrome or Edge. If neither is installed it opens in your default browser. You can also just double-click `index.html`.

No install, build step or internet connection is needed.

**Pin it like an app:** once the window is open, right-click its icon in the taskbar/dock and choose *Pin* / *Keep in Dock*.

**First run notes**
- Windows may show *“Windows protected your PC”* because the exe isn't code-signed: click *More info* → *Run anyway*. It only asks once.
- macOS may say the file is from an unidentified developer: right-click `Start-Mac.command` → *Open* → *Open*. A Terminal window flashes open; you can close it.
- Linux file managers may ask whether to run or display the script: choose *Run*. If it isn't executable, run `chmod +x start-linux.sh` once.

**Your data** is saved in the browser profile that opened the app, so keep using the same launcher (or browser) to see your strategies and trades. Use *Export data* on the Trade Log to back up or move to another computer.

## Rebuilding the Windows exe

After changing `index.html`, `app.js` or `styles.css`, rebuild the exe so its built-in copy is up to date (needs [Go](https://go.dev/dl/)):

```sh
sh windows/build.sh
```

The launcher source is `windows/main.go`. When the exe sits next to `index.html` it opens that file directly; otherwise it unpacks its built-in copy to `%LOCALAPPDATA%\TradingRulesCheckbook\app` and opens that.
