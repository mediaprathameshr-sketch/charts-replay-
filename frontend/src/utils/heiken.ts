import type { Candle } from '../types';

/**
 * Converts standard OHLC candles into Heiken Ashi candles.
 *
 * HA Close = (Open + High + Low + Close) / 4
 * HA Open  = (Previous HA Open + Previous HA Close) / 2  (first bar: (O+C)/2)
 * HA High  = max(High, HA Open, HA Close)
 * HA Low   = min(Low, HA Open, HA Close)
 *
 * Runs once, in a single O(n) pass, when a dataset is loaded. Never
 * recomputed during replay — the replay engine only reveals/hides values
 * that already exist in this array.
 */
export function toHeikenAshi(candles: Candle[]): Candle[] {
  const result: Candle[] = new Array(candles.length);
  let prevHaOpen = 0;
  let prevHaClose = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    result[i] = {
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
      oi: c.oi,
      symbol: c.symbol,
      expiry: c.expiry,
      strike: c.strike,
      exchange: c.exchange,
    };

    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }

  return result;
}
