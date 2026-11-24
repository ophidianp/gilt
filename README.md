# gilt

Paper trading on live prices: a small Windows app where you trade the real market with pretend
money, plus its website and the brand files behind both. Same design family as Mouse 33, Argon,
Chlorine and the rest: plain dark grey, one accent (gold), Inter / Inter Tight / JetBrains Mono,
pill buttons, and a hand-drawn slanted wordmark.

| Folder   | What it is |
|----------|------------|
| `app/`   | The desktop app (Tauri 2 + plain TypeScript, no UI framework) |
| `site/`  | The website (Home, Features, Download, 404). The installer goes in `site/downloads/` |
| `brand/` | The "gilt" wordmark and the g icon, drawn by `gilt_logo.py`; `make_assets.py` writes every logo file |
| `tools/` | `build_site.py` writes the site's pages from one shared shell |

## The app

- **Paper account**: choose any starting cash ($1 to $1B). Account value, today's change, all-time change,
  buying power, open and closed P/L, win rate, and a chart of the account's value (recorded every minute).
- **Orders**: market, limit and stop, in shares or dollars, with a review step. Market orders placed while
  the market is closed fill at the next open; limit and stop orders wait for their price. Waiting buys
  hold back their cost and waiting sells their shares. Full history with Cancel for waiting orders.
- **Stock pages**: live price, 1D–5Y chart with hover readout, your position, the order ticket, its orders.
- **Full-screen chart** (the expand button on a stock's chart, or F): 14 chart types (candle, bar, colored
  bar, line, colored line, vertex line, step, mountain, baseline, hollow candle, volume candle, colored HLC,
  data points, histogram), ranges 1D to MAX with a choice of bar size, an open/high/low/close/volume readout
  for the bar under the pointer, a volume pane, scroll to zoom and drag to pan, SMA 20/50/200, EMA 21,
  Bollinger bands and VWAP, and drawings (horizontal line, trend line, note, measure) saved per stock.
- **Forecast and notes** (`app/src/outlook.ts`): a forecast cone worked out on the computer from the chart's
  recent trend and volatility, with 50% and 90% ranges, the chance of ending higher, and how the same method
  did on that chart's own past. Automatic notes mark support, resistance, period highs and lows, 20/50
  crossovers, volume spikes and gaps.
- **Ask Claude** (`app/src/ai.ts`): with your own Anthropic API key (Settings → AI), Claude reads the bars on
  screen and returns an outlook, a likely range and notes pinned on the chart. Nothing is sent until you
  press the button; the key is stored only on this computer.
- **Settings**: theme (dark, light, system), gain/loss colours (including a colour-blind-friendly pair),
  motion, density, chart defaults, refresh rates, time zone, review step, default order type and unit,
  fractional shares, simulated commission and slippage, fill pop-ups and sound, the API key and model,
  always on top, start maximized, backup and restore, resets, and keyboard shortcuts.
- **Markets**: your watchlist as live cards and the ten biggest US companies.
- **Sidebar**: account value and a live watchlist. Ctrl+K searches any stock from anywhere.

Prices come from Yahoo Finance's public endpoints (no key or account), fetched by the Rust side
(`app/src-tauri/src/lib.rs`) through one feed (`app/src/live.ts`): every 3 seconds while the US market
is open, every 30 seconds when it's closed (both adjustable in Settings). The order engine is `app/src/account.ts`. Everything is
saved in the app's local storage; a portfolio from gilt 0.1's Practice tab is carried over.

### Run and build

Needs Node 20+, Rust (stable, MSVC) and the Visual Studio C++ build tools.

```powershell
cd app
npm install
npm run tauri dev      # run with hot reload
npm run dev            # or just the UI in a browser, with live prices through a dev proxy
npm run tauri build    # installer lands in <target>/release/bundle/nsis/
```

If the build fails with `LNK1104 cannot open file`, the folder path is too long for Windows.
Point the build output somewhere short first:

```powershell
$env:CARGO_TARGET_DIR = "C:\gilt-build"
```

## The logo

`brand/gilt_logo.py` writes "gilt" the way the other logos in the family are made: a flat 5.6 × 2.2 pen
nib swept along smooth curves through hand-placed knots, unioned into one piece and slanted 44°. The g's
descender curls left under its bowl and loops back up into the i. The icon is that g in ink on a gold tile.

```powershell
python -I brand/preview.py out.png        # render the wordmark to check it (add "mark" for the g)
python -I brand/make_assets.py            # brand/out/*, the site's favicon, touch icon and og.png,
                                          # app/src/logo.json, and the wordmark in every site page
cd app; npm run icons                     # app icons from brand/out/icon-1024.png
```

Needs Python with `shapely`, `numpy` and `Pillow`.

## The website

```powershell
python -I tools/build_site.py             # rewrites site/*.html (version and installer name at the top)
python -m http.server 8080 --directory site
```
