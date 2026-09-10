import { useRef } from 'react';

interface ToolbarProps {
  fileName: string | null;
  onFileSelected: (file: File) => void;
  dateValue: string;
  timeValue: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onStartReplay: () => void;
  canStartReplay: boolean;
  totalCandles: number;
}

export default function Toolbar({
  fileName,
  onFileSelected,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  onStartReplay,
  canStartReplay,
  totalCandles,
}: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        <button
          className="btn btn--primary"
          onClick={() => inputRef.current?.click()}
          title="Load a CSV file of OHLCV candles"
        >
          Load CSV
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelected(f);
            e.target.value = '';
          }}
        />
        <span className="toolbar__filename" title={fileName ?? undefined}>
          {fileName ?? 'No file loaded'}
          {totalCandles > 0 && (
            <span className="toolbar__count"> · {totalCandles.toLocaleString()} candles</span>
          )}
        </span>
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group">
        <label className="field">
          <span className="field__label">Date</span>
          <input
            type="date"
            className="field__input"
            value={dateValue}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={totalCandles === 0}
          />
        </label>
        <label className="field">
          <span className="field__label">Time</span>
          <input
            type="time"
            step={1}
            className="field__input"
            value={timeValue}
            onChange={(e) => onTimeChange(e.target.value)}
            disabled={totalCandles === 0}
          />
        </label>
        <button
          className="btn btn--signal"
          onClick={onStartReplay}
          disabled={!canStartReplay}
          title="Jump to the nearest candle at or after the selected date/time"
        >
          Start Replay
        </button>
      </div>
    </div>
  );
}
