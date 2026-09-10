import type { PlaybackSpeed, ReplayState } from '../types';

const SPEEDS: PlaybackSpeed[] = [1, 2, 5, 10];

interface ReplayControlsProps {
  state: ReplayState;
  onPrevious: () => void;
  onNext: () => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
}

export default function ReplayControls({
  state,
  onPrevious,
  onNext,
  onPlay,
  onPause,
  onReset,
  onSpeedChange,
}: ReplayControlsProps) {
  const hasReplay = state.currentIndex >= 0;
  const atStart = state.currentIndex <= state.startIndex;

  return (
    <div className="replay-controls">
      <button
        className="btn btn--icon"
        onClick={onPrevious}
        disabled={!hasReplay || atStart}
        title="Previous candle (Left Arrow)"
        aria-label="Previous candle"
      >
        ⏮
      </button>

      {state.isPlaying ? (
        <button
          className="btn btn--icon btn--icon-lg"
          onClick={onPause}
          disabled={!hasReplay}
          title="Pause (Space)"
          aria-label="Pause"
        >
          ⏸
        </button>
      ) : (
        <button
          className="btn btn--icon btn--icon-lg"
          onClick={onPlay}
          disabled={!hasReplay}
          title="Play (Space)"
          aria-label="Play"
        >
          ▶
        </button>
      )}

      <button
        className="btn btn--icon"
        onClick={onNext}
        disabled={!hasReplay}
        title="Next candle (Right Arrow)"
        aria-label="Next candle"
      >
        ⏭
      </button>

      <button
        className="btn"
        onClick={onReset}
        disabled={!hasReplay}
        title="Reset to the first replay candle"
      >
        Reset
      </button>

      <div className="speed-group" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`btn btn--speed ${state.speed === s ? 'btn--speed-active' : ''}`}
            onClick={() => onSpeedChange(s)}
            disabled={!hasReplay}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
