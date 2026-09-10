/**
 * Shared type definitions for the replay app.
 */

/** A fully-known OHLCV candle, time in Unix epoch seconds (lightweight-charts format). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  oi?: number | null;
  symbol?: string | null;
  expiry?: string | null;
  strike?: number | null;
  exchange?: string | null;
}

/** Minimal shape lightweight-charts needs for a candlestick data point. */
export interface CandlestickPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type PlaybackSpeed = 1 | 2 | 5 | 10;

export interface ReplayState {
  /** Index of the candle currently being formed (may be partially revealed). */
  currentIndex: number;
  /** Index the replay session began at. */
  startIndex: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  /** True once currentIndex's candle has been fully revealed via Next/Play. */
  hasStarted: boolean;
}

export interface ParseWarning {
  row?: number | null;
  message: string;
}

export interface ParseResult {
  candles: Candle[];
  total: number;
  warnings: ParseWarning[];
  columns_detected: Record<string, string>;
}
