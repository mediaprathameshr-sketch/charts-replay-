# Candle Replay — Dual-Chart OHLC & Heiken Ashi

A minimal, fast tool for replaying OHLCV candle data one bar at a time to
study candle formation. Two synchronized charts — standard candlesticks and
Heiken Ashi — reveal only the **opening price** of the candle currently
forming; the rest of the bar stays hidden until you advance the replay.

This is intentionally not a trading platform: no indicators, drawing tools,
watchlists, or order panels. Just clean, synchronized replay.

## Features

- CSV import with header-based column detection (order-independent)
- Handles 100k–1,000,000+ candle files
- Heiken Ashi computed once at load time, never recalculated during replay
- Two charts kept in lockstep: crosshair, zoom, scroll, and replay position
- Replay reveals only the opening price of the forming candle; advancing
  completes it and opens the next one the same way
- Play / Pause / Next / Previous / Reset, with 1×/2×/5×/10× speed
- Jump to any date & time — replay starts at the nearest future candle
- Drag-and-drop CSV upload, keyboard shortcuts, dark UI

## Project structure

```
chart-replay/
  backend/
    main.py          FastAPI app (upload + heiken-ashi endpoints)
    csv_loader.py     Header-based CSV parsing & normalization
    heiken.py          Heiken Ashi generation (server-side mirror)
    models.py          Pydantic schemas
    requirements.txt
  frontend/
    src/
      components/      Toolbar, ReplayControls, ChartPanel, StatusBar
      hooks/            useReplay (state machine), useChartSync (mirroring)
      utils/            csv.ts, heiken.ts (client-side, primary path)
      services/         api.ts (talks to the backend, with fallback)
      App.tsx
  sample_data.csv     300 five-minute candles for quick testing
```

The frontend parses CSVs itself by default (`src/utils/csv.ts`) so large
files never leave the browser; if the FastAPI backend is running, uploads
are routed through `/api/upload-csv` instead to keep parsing off the UI
thread. Both parsers use identical column-detection rules.

## Requirements

- Node.js 18+
- Python 3.10+

## Setup

### Backend (optional, but recommended for large files)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`. Health check: `GET /api/health`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api/*` to
`http://localhost:8000` (see `vite.config.ts`), so start the backend first
if you want it in the loop — otherwise the app falls back to parsing CSVs
client-side automatically.

## Using it

1. **Load CSV** — click the button or drag a `.csv` file anywhere onto the
   window. Try `sample_data.csv` in the project root.
2. Pick a **Date** and **Time**, then **Start Replay**. Replay jumps to the
   nearest candle at or after that moment.
3. Use **Next** / **Play** to advance. Each step reveals the full OHLC of
   the candle you're leaving and opens the next candle showing only its
   open price, on both charts simultaneously.
4. **Previous** / **Reset** step back or return to the start of the
   session. **Speed** (1×/2×/5×/10×) controls playback pace and is
   remembered for next time.

### Keyboard shortcuts

| Key         | Action        |
|-------------|---------------|
| Space       | Play / Pause  |
| Right Arrow | Next candle   |
| Left Arrow  | Previous candle |

## CSV format

Only column **names** matter — order is irrelevant, and unrecognized extra
columns (symbol, expiry, strike, exchange, oi, ...) are read if present and
otherwise ignored.

Required: `open`, `high`, `low`, `close`, and either `datetime` or `epoch`
(if both exist, `epoch` is used since that's the timestamp format
lightweight-charts renders natively).

```csv
datetime,epoch,open,high,low,close,volume
07-01-2026 09:15:00,1767777300,23900.0,23907.35,23895.87,23906.97,284053
07-01-2026 09:20:00,1767777600,23906.97,23908.51,23877.84,23888.95,621858
```

Recognized header aliases include `date`/`timestamp` for datetime,
`unix`/`time` for epoch, and single-letter `o`/`h`/`l`/`c`/`v` for OHLCV.

Rows with duplicate or out-of-order timestamps, missing required fields, or
unparseable dates are skipped with a warning shown in the toolbar rather
than failing the whole import.

## Performance notes

- Heiken Ashi is computed once, in a single pass, at load time.
- Replay never re-renders the full dataset: each step calls
  `series.update()` on lightweight-charts to upsert only the bar that
  changed (O(1) per step). Stepping backward re-slices the visible range,
  which is the one operation that isn't strictly O(1), but only touches
  data up to the current replay index, not the full file.
- The CSV parser is a single streaming pass (no external CSV library), fine
  for very large files.
