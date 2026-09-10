import type { ReplayState } from '../types';

interface StatusBarProps {
  state: ReplayState;
  totalCandles: number;
  currentTime: number | null; // epoch seconds of the candle currently forming
}

function formatEpoch(epoch: number | null): string {
  if (epoch === null) return '—';
  const d = new Date(epoch * 1000);
  return d.toISOString().slice(0, 19).replace('T', '  ') + ' UTC';
}

export default function StatusBar({ state, totalCandles, currentTime }: StatusBarProps) {
  const hasReplay = state.currentIndex >= 0;
  const candleNumber = hasReplay ? state.currentIndex - state.startIndex + 1 : 0;

  return (
    <div className="status-bar">
      <span className="status-bar__item">
        <span className="status-bar__label">Time</span>
        <span className="status-bar__value">{formatEpoch(currentTime)}</span>
      </span>
      <span className="status-bar__sep" />
      <span className="status-bar__item">
        <span className="status-bar__label">Candle</span>
        <span className="status-bar__value">
          {hasReplay ? `${candleNumber} / ${totalCandles - state.startIndex}` : '—'}
        </span>
      </span>
      <span className="status-bar__sep" />
      <span className="status-bar__item">
        <span className="status-bar__label">Speed</span>
        <span className="status-bar__value">{state.speed}×</span>
      </span>
      <span className="status-bar__sep" />
      <span className="status-bar__item">
        <span className="status-bar__label">Mode</span>
        <span className={`status-bar__value ${state.isPlaying ? 'status-bar__value--live' : ''}`}>
          {!hasReplay ? 'Idle' : state.isPlaying ? 'Playing' : 'Paused'}
        </span>
      </span>
      <span className="status-bar__sep" />
      <span className="status-bar__item">
        <span className="status-bar__label">Total</span>
        <span className="status-bar__value">{totalCandles.toLocaleString()}</span>
      </span>
    </div>
  );
}
