import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from './components/Toolbar';
import ReplayControls from './components/ReplayControls';
import ChartPanel, { type ChartPanelHandle } from './components/ChartPanel';
import StatusBar from './components/StatusBar';
import { useReplay } from './hooks/useReplay';
import { useChartSync } from './hooks/useChartSync';
import { parseCsvText, CsvParseError } from './utils/csv';
import { toHeikenAshi } from './utils/heiken';
import { uploadCsv, checkHealth } from './services/api';
import type { Candle, CandlestickPoint, PlaybackSpeed } from './types';
import './App.css';

const SPEED_STORAGE_KEY = 'chart-replay:last-speed';

function toPoint(c: Candle): CandlestickPoint {
  return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
}

function openOnlyPoint(c: Candle): CandlestickPoint {
  return { time: c.time, open: c.open, high: c.open, low: c.open, close: c.open };
}

function decimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  const decimal = text.indexOf('.');
  return decimal === -1 ? 0 : text.length - decimal - 1;
}

/**
 * The HA candle's "at opening" appearance.
 *
 * HA Open doesn't depend on the current bar at all — it's just
 * (previous HA open + previous HA close) / 2 — so it's already fully known
 * the instant this candle starts. What's NOT known yet is where price is
 * now; the only tick we've actually seen is the raw open of this bar. So
 * an honest partial HA candle is: Open = real HA open, Close = raw open
 * (the one price we've seen), High/Low = max/min of the two. This is not
 * flat in general — it shows the real gap between the smoothed HA open and
 * where the market is opening, which is how a live HA candle actually
 * looks the moment it starts printing.
 */
function haOpeningPoint(haCandle: Candle, rawCandle: Candle): CandlestickPoint {
  const open = haCandle.open;
  const close = rawCandle.open;
  return { time: haCandle.time, open, high: Math.max(open, close), low: Math.min(open, close), close };
}

export default function App() {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [haCandles, setHaCandles] = useState<Candle[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showWarnings, setShowWarnings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [dateValue, setDateValue] = useState('');
  const [timeValue, setTimeValue] = useState('');

  const replay = useReplay(candles.length);
  const pricePrecision = useMemo(
    () => Math.max(2, ...candles.flatMap((c) => [c.open, c.high, c.low, c.close].map(decimalPlaces))),
    [candles]
  );
  const leftChartRef = useRef<ChartPanelHandle>(null);
  const rightChartRef = useRef<ChartPanelHandle>(null);
  const sync = useChartSync(leftChartRef, rightChartRef);

  // Restore last-used playback speed.
  useEffect(() => {
    const saved = localStorage.getItem(SPEED_STORAGE_KEY);
    if (saved) {
      const parsed = Number(saved) as PlaybackSpeed;
      if ([1, 2, 5, 10].includes(parsed)) replay.setSpeed(parsed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSpeedChange = useCallback(
    (speed: PlaybackSpeed) => {
      replay.setSpeed(speed);
      localStorage.setItem(SPEED_STORAGE_KEY, String(speed));
    },
    [replay]
  );

  // ---- CSV loading -------------------------------------------------------

  const applyParsedCandles = useCallback((parsed: Candle[]) => {
    const ha = toHeikenAshi(parsed);
    setCandles(parsed);
    setHaCandles(ha);

    // Seed the charts with the full dataset so the user can browse before
    // starting a replay session.
    const points = parsed.map(toPoint);
    const haPoints = ha.map(toPoint);
    leftChartRef.current?.setData(points);
    rightChartRef.current?.setData(haPoints);
    leftChartRef.current?.fitContent();
    rightChartRef.current?.fitContent();

    // Default the date/time pickers to the first candle so "Start Replay"
    // works immediately without extra input.
    const first = new Date(parsed[0].time * 1000);
    setDateValue(first.toISOString().slice(0, 10));
    setTimeValue(first.toISOString().slice(11, 19));
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      setError(null);
      setWarnings([]);
      setIsLoading(true);
      setFileName(file.name);
      try {
        const backendUp = await checkHealth();
        const result = backendUp ? await uploadCsv(file) : parseCsvText(await file.text());
        applyParsedCandles(result.candles as Candle[]);
        if (result.warnings.length > 0) {
          setWarnings(result.warnings.map((w) => (w.row ? `Row ${w.row}: ${w.message}` : w.message)));
        }
      } catch (err) {
        if (err instanceof CsvParseError || err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to load the CSV file.');
        }
        setCandles([]);
        setHaCandles([]);
      } finally {
        setIsLoading(false);
      }
    },
    [applyParsedCandles]
  );

  // Drag-and-drop upload.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDragActive(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer?.files?.[0];
      if (f && f.name.toLowerCase().endsWith('.csv')) loadFile(f);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [loadFile]);

  // ---- Start replay: locate nearest candle at/after selected date+time --

  const handleStartReplay = useCallback(() => {
    if (candles.length === 0 || !dateValue || !timeValue) return;
    const targetEpoch = Math.floor(new Date(`${dateValue}T${timeValue}Z`).getTime() / 1000);

    // Candles are time-ordered; binary search for the first index whose
    // time is >= targetEpoch ("nearest future candle").
    let lo = 0;
    let hi = candles.length - 1;
    let found = candles.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].time >= targetEpoch) {
        found = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    replay.startReplayAt(found);
  }, [candles, dateValue, timeValue, replay]);

  // ---- Efficient chart updates driven by replay index changes -----------

  const prevIndexRef = useRef<number>(-1);
  const prevStartRef = useRef<number>(-1);

  useEffect(() => {
    const { currentIndex, startIndex } = replay.state;
    const left = leftChartRef.current;
    const right = rightChartRef.current;
    if (currentIndex < 0 || !left || !right) return;

    const isFreshStart = startIndex !== prevStartRef.current;
    const prevIdx = prevIndexRef.current;

    if (isFreshStart) {
      left.setData(candles.slice(0, startIndex).map(toPoint));
      right.setData(haCandles.slice(0, startIndex).map(toPoint));
      left.updateBar(openOnlyPoint(candles[startIndex]));
      right.updateBar(haOpeningPoint(haCandles[startIndex], candles[startIndex]));
      left.focusReplayCandle(startIndex);
      right.focusReplayCandle(startIndex);
    } else if (currentIndex === prevIdx + 1) {
      // Single forward step: reveal the bar we're leaving, mask the new one.
      left.updateBar(toPoint(candles[prevIdx]));
      right.updateBar(toPoint(haCandles[prevIdx]));
      left.updateBar(openOnlyPoint(candles[currentIndex]));
      right.updateBar(haOpeningPoint(haCandles[currentIndex], candles[currentIndex]));
    } else if (currentIndex !== prevIdx) {
      // Stepping backward, or a fresh jump within the same session (Reset):
      // rebuild the visible slice up to the new current index.
      left.setData(candles.slice(0, currentIndex).map(toPoint));
      right.setData(haCandles.slice(0, currentIndex).map(toPoint));
      left.updateBar(openOnlyPoint(candles[currentIndex]));
      right.updateBar(haOpeningPoint(haCandles[currentIndex], candles[currentIndex]));
    }

    prevStartRef.current = startIndex;
    prevIndexRef.current = currentIndex;
  }, [replay.state.currentIndex, replay.state.startIndex, candles, haCandles]);

  // ---- Keyboard shortcuts -------------------------------------------------

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        replay.state.isPlaying ? replay.pause() : replay.play();
      } else if (e.code === 'ArrowRight') {
        replay.next();
      } else if (e.code === 'ArrowLeft') {
        replay.previous();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [replay]);

  const currentTime = useMemo(() => {
    if (replay.state.currentIndex < 0 || replay.state.currentIndex >= candles.length) return null;
    return candles[replay.state.currentIndex].time;
  }, [replay.state.currentIndex, candles]);

  return (
    <div className={`app ${dragActive ? 'app--drag' : ''}`}>
      <Toolbar
        fileName={fileName}
        onFileSelected={loadFile}
        dateValue={dateValue}
        timeValue={timeValue}
        onDateChange={setDateValue}
        onTimeChange={setTimeValue}
        onStartReplay={handleStartReplay}
        canStartReplay={candles.length > 0 && !isLoading}
        totalCandles={candles.length}
      />

      <div className="app__toolbar-row2">
        <ReplayControls
          state={replay.state}
          onPrevious={replay.previous}
          onNext={replay.next}
          onPlay={replay.play}
          onPause={replay.pause}
          onReset={replay.reset}
          onSpeedChange={handleSpeedChange}
        />
        {warnings.length > 0 && (
          <button className="warnings-toggle" onClick={() => setShowWarnings((s) => !s)}>
            ⚠ {warnings.length} row{warnings.length === 1 ? '' : 's'} skipped
          </button>
        )}
      </div>

      {error && <div className="banner banner--error">{error}</div>}

      {showWarnings && warnings.length > 0 && (
        <div className="warnings-panel">
          {warnings.slice(0, 200).map((w, i) => (
            <div key={i} className="warnings-panel__row">
              {w}
            </div>
          ))}
          {warnings.length > 200 && (
            <div className="warnings-panel__row">…and {warnings.length - 200} more</div>
          )}
        </div>
      )}

      <div className="charts">
        <ChartPanel
          ref={leftChartRef}
          title="Candlestick"
          accent="#35b8a6"
          pricePrecision={pricePrecision}
          onCrosshairMove={sync.onLeftCrosshairMove}
          onVisibleRangeChange={sync.onLeftVisibleRangeChange}
        />
        <ChartPanel
          ref={rightChartRef}
          title="Heiken Ashi"
          accent="#e8a33d"
          pricePrecision={pricePrecision}
          onCrosshairMove={sync.onRightCrosshairMove}
          onVisibleRangeChange={sync.onRightVisibleRangeChange}
        />
      </div>

      <StatusBar state={replay.state} totalCandles={candles.length} currentTime={currentTime} />

      {candles.length === 0 && !isLoading && (
        <div className="empty-overlay">
          <div className="empty-overlay__card">
            <div className="empty-overlay__glyph" aria-hidden>
              ▤▥
            </div>
            <h2>Load a CSV to begin</h2>
            <p>Drag a file anywhere on this window, or use “Load CSV” above.</p>
            <p className="empty-overlay__hint">
              Required columns: datetime or epoch, open, high, low, close.
            </p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="empty-overlay">
          <div className="empty-overlay__card">Parsing candles…</div>
        </div>
      )}
    </div>
  );
}
