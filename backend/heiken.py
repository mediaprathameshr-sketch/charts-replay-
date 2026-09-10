"""
Heiken Ashi candle generation.

HA Close = (Open + High + Low + Close) / 4
HA Open  = (Previous HA Open + Previous HA Close) / 2   (first candle: (O+C)/2)
HA High  = max(High, HA Open, HA Close)
HA Low   = min(Low, HA Open, HA Close)

Computed once, in a single O(n) pass. The frontend also implements this
(see src/utils/heiken.ts) so replay stays fully client-side; this module
exists so the backend can optionally serve pre-computed HA data too.
"""
from __future__ import annotations

from models import Candle


def to_heiken_ashi(candles: list[Candle]) -> list[Candle]:
    ha_candles: list[Candle] = []
    prev_ha_open: float | None = None
    prev_ha_close: float | None = None

    for c in candles:
        ha_close = (c.open + c.high + c.low + c.close) / 4.0
        if prev_ha_open is None or prev_ha_close is None:
            ha_open = (c.open + c.close) / 2.0
        else:
            ha_open = (prev_ha_open + prev_ha_close) / 2.0
        ha_high = max(c.high, ha_open, ha_close)
        ha_low = min(c.low, ha_open, ha_close)

        ha_candles.append(
            Candle(
                time=c.time,
                open=ha_open,
                high=ha_high,
                low=ha_low,
                close=ha_close,
                volume=c.volume,
                oi=c.oi,
                symbol=c.symbol,
                expiry=c.expiry,
                strike=c.strike,
                exchange=c.exchange,
            )
        )
        prev_ha_open, prev_ha_close = ha_open, ha_close

    return ha_candles
