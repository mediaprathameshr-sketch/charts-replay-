"""
Pydantic models shared across the FastAPI backend.

The backend's job is intentionally narrow: parse an uploaded CSV into a
clean, column-order-independent list of OHLCV candles and hand it to the
frontend as JSON. All replay logic lives in the browser.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class Candle(BaseModel):
    """A single OHLCV candle, normalized to a Unix epoch (seconds)."""

    time: int  # unix epoch seconds - required by lightweight-charts
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = None
    oi: Optional[float] = None
    symbol: Optional[str] = None
    expiry: Optional[str] = None
    strike: Optional[float] = None
    exchange: Optional[str] = None


class ParseWarning(BaseModel):
    """A non-fatal issue found while parsing (duplicate/out-of-order rows, etc.)."""

    row: Optional[int] = None
    message: str


class ParseResult(BaseModel):
    """Response returned by POST /api/upload-csv."""

    candles: list[Candle]
    total: int
    warnings: list[ParseWarning] = []
    columns_detected: dict[str, str] = {}


class ErrorResponse(BaseModel):
    detail: str
