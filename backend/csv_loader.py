"""
CSV loading and normalization.

Detects OHLCV columns by header name (case-insensitive, order-independent),
tolerates unknown extra columns, and converts every row into a Candle with
a Unix epoch timestamp (the format lightweight-charts expects).

Designed to stream through large files (100k-1M+ rows) using Python's
built-in csv.DictReader rather than loading everything into memory as a
DataFrame, keeping peak memory low and avoiding a pandas dependency.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Iterable

from models import Candle, ParseResult, ParseWarning

# Header aliases we recognize, lower-cased. Extend freely; anything not
# listed here is treated as an "unknown" column and silently ignored.
FIELD_ALIASES: dict[str, list[str]] = {
    "datetime": ["datetime", "date_time", "date time", "timestamp", "date"],
    "epoch": ["epoch", "unix", "unixtime", "unix_time", "time"],
    "open": ["open", "o"],
    "high": ["high", "h"],
    "low": ["low", "l"],
    "close": ["close", "c"],
    "volume": ["volume", "vol", "v"],
    "oi": ["oi", "openinterest", "open_interest"],
    "symbol": ["symbol", "ticker", "instrument"],
    "expiry": ["expiry", "expiration", "expiry_date"],
    "strike": ["strike", "strike_price"],
    "exchange": ["exchange", "exch"],
}

REQUIRED_OHLC = ["open", "high", "low", "close"]

# datetime formats we try, in order. Add more as real-world data demands.
DATETIME_FORMATS = [
    "%d-%m-%Y %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%d-%m-%Y %H:%M",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
    "%d/%m/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M:%S",
    "%Y-%m-%d",
    "%d-%m-%Y",
]


class CsvParseError(Exception):
    """Raised for fatal, unrecoverable CSV problems (missing columns, empty file)."""


def _build_header_map(fieldnames: Iterable[str]) -> dict[str, str]:
    """Map our canonical field name -> the actual header string in the file."""
    normalized = {h.strip().lower(): h for h in fieldnames if h is not None}
    mapping: dict[str, str] = {}
    for canonical, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in normalized:
                mapping[canonical] = normalized[alias]
                break
    return mapping


def _parse_datetime_to_epoch(value: str) -> int:
    value = value.strip()
    for fmt in DATETIME_FORMATS:
        try:
            dt = datetime.strptime(value, fmt)
            return int(dt.replace(tzinfo=timezone.utc).timestamp())
        except ValueError:
            continue
    # last resort: fromisoformat handles many variants directly
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError as exc:
        raise CsvParseError(f"Unrecognized datetime format: '{value}'") from exc


def parse_csv_bytes(raw: bytes) -> ParseResult:
    if not raw or not raw.strip():
        raise CsvParseError("The file is empty.")

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("latin-1")
        except Exception as exc:  # pragma: no cover - extremely unlikely
            raise CsvParseError("Could not decode file as text.") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise CsvParseError("No header row found.")

    header_map = _build_header_map(reader.fieldnames)

    has_datetime = "datetime" in header_map
    has_epoch = "epoch" in header_map
    if not has_datetime and not has_epoch:
        raise CsvParseError(
            "CSV must contain either a 'datetime' or 'epoch' column."
        )

    missing_ohlc = [f for f in REQUIRED_OHLC if f not in header_map]
    if missing_ohlc:
        raise CsvParseError(
            f"CSV is missing required column(s): {', '.join(missing_ohlc)}."
        )

    candles: list[Candle] = []
    warnings: list[ParseWarning] = []
    seen_times: set[int] = set()
    last_time: int | None = None
    row_num = 1  # header is row 0

    for row in reader:
        row_num += 1
        try:
            # Prefer epoch when both are present (per spec: lightweight-charts
            # wants Unix timestamps, so avoid a lossy round trip through a
            # parsed datetime when we already have the epoch).
            if has_epoch and row.get(header_map["epoch"]):
                raw_epoch = row[header_map["epoch"]].strip()
                if not raw_epoch:
                    raise CsvParseError("empty epoch")
                time_val = int(float(raw_epoch))
            elif has_datetime:
                time_val = _parse_datetime_to_epoch(row[header_map["datetime"]])
            else:
                warnings.append(ParseWarning(row=row_num, message="Row missing time value, skipped."))
                continue

            def _num(field: str) -> float:
                raw_val = row.get(header_map[field], "")
                if raw_val is None or raw_val.strip() == "":
                    raise CsvParseError(f"missing {field}")
                return float(raw_val)

            o, h, l, c = _num("open"), _num("high"), _num("low"), _num("close")

            volume = None
            if "volume" in header_map and row.get(header_map["volume"]):
                try:
                    volume = float(row[header_map["volume"]])
                except ValueError:
                    volume = None

            oi = None
            if "oi" in header_map and row.get(header_map["oi"]):
                try:
                    oi = float(row[header_map["oi"]])
                except ValueError:
                    oi = None

            strike = None
            if "strike" in header_map and row.get(header_map["strike"]):
                try:
                    strike = float(row[header_map["strike"]])
                except ValueError:
                    strike = None

        except (CsvParseError, ValueError) as exc:
            warnings.append(ParseWarning(row=row_num, message=f"Skipped invalid row: {exc}"))
            continue

        if time_val in seen_times:
            warnings.append(ParseWarning(row=row_num, message=f"Duplicate timestamp {time_val}, skipped."))
            continue
        if last_time is not None and time_val < last_time:
            warnings.append(ParseWarning(row=row_num, message=f"Out-of-order timestamp {time_val}, skipped."))
            continue

        seen_times.add(time_val)
        last_time = time_val

        candles.append(
            Candle(
                time=time_val,
                open=o,
                high=h,
                low=l,
                close=c,
                volume=volume,
                oi=oi,
                symbol=row.get(header_map.get("symbol", ""), None) or None,
                expiry=row.get(header_map.get("expiry", ""), None) or None,
                strike=strike,
                exchange=row.get(header_map.get("exchange", ""), None) or None,
            )
        )

    if not candles:
        raise CsvParseError("No valid candle rows were found in the file.")

    return ParseResult(
        candles=candles,
        total=len(candles),
        warnings=warnings,
        columns_detected={k: v for k, v in header_map.items()},
    )
