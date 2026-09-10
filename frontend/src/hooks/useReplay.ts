import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackSpeed, ReplayState } from '../types';

const SPEED_INTERVAL_MS: Record<PlaybackSpeed, number> = {
  1: 900,
  2: 450,
  5: 180,
  10: 90,
};

const initialState = (): ReplayState => ({
  currentIndex: -1,
  startIndex: -1,
  isPlaying: false,
  speed: 1,
  hasStarted: false,
});

/**
 * Drives the replay index forward/backward. Deliberately holds no chart or
 * candle data itself — it only knows "which index are we revealing" and
 * "are we playing". A consuming effect elsewhere translates index changes
 * into O(1) chart updates.
 *
 * Semantics (see spec): candles before `currentIndex` are fully revealed;
 * the candle AT `currentIndex` is shown open-only (still forming); nothing
 * after `currentIndex` is shown. Advancing therefore both (a) implicitly
 * completes the previous "current" candle by moving past it, and
 * (b) reveals the next candle's opening price only — matching the
 * "Candle 1 completes, Candle 2 appears open-only" behavior exactly.
 */
export function useReplay(totalCandles: number) {
  const [state, setState] = useState<ReplayState>(initialState);
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const stopTimer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startReplayAt = useCallback(
    (index: number) => {
      stopTimer();
      const clamped = Math.max(0, Math.min(index, totalCandles - 1));
      setState((s) => ({
        ...s,
        currentIndex: clamped,
        startIndex: clamped,
        isPlaying: false,
        hasStarted: true,
      }));
    },
    [totalCandles, stopTimer]
  );

  const next = useCallback(() => {
    setState((s) => {
      if (s.currentIndex < 0) return s;
      if (s.currentIndex >= totalCandles - 1) return { ...s, isPlaying: false };
      return { ...s, currentIndex: s.currentIndex + 1 };
    });
  }, [totalCandles]);

  const previous = useCallback(() => {
    setState((s) => {
      if (s.currentIndex <= s.startIndex) return s;
      return { ...s, currentIndex: s.currentIndex - 1, isPlaying: false };
    });
  }, []);

  const reset = useCallback(() => {
    stopTimer();
    setState((s) => ({ ...s, currentIndex: s.startIndex, isPlaying: false }));
  }, [stopTimer]);

  const play = useCallback(() => {
    setState((s) => {
      if (s.currentIndex < 0 || s.currentIndex >= totalCandles - 1) return s;
      return { ...s, isPlaying: true };
    });
  }, [totalCandles]);

  const pause = useCallback(() => {
    stopTimer();
    setState((s) => ({ ...s, isPlaying: false }));
  }, [stopTimer]);

  const setSpeed = useCallback((speed: PlaybackSpeed) => {
    setState((s) => ({ ...s, speed }));
  }, []);

  // Playback loop: requestAnimationFrame drives a coarse clock, but we only
  // actually advance the index once the configured interval has elapsed —
  // keeps timing smooth without scheduling a new setTimeout on every frame.
  useEffect(() => {
    if (!state.isPlaying) return;

    lastTickRef.current = performance.now();
    const intervalMs = SPEED_INTERVAL_MS[state.speed];

    const tick = (now: number) => {
      if (now - lastTickRef.current >= intervalMs) {
        lastTickRef.current = now;
        next();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [state.isPlaying, state.speed, next]);

  // Auto-pause when we hit the end of the dataset.
  useEffect(() => {
    if (state.currentIndex >= totalCandles - 1 && state.isPlaying) {
      setState((s) => ({ ...s, isPlaying: false }));
    }
  }, [state.currentIndex, state.isPlaying, totalCandles]);

  useEffect(() => stopTimer, [stopTimer]);

  return { state, startReplayAt, next, previous, reset, play, pause, setSpeed };
}
