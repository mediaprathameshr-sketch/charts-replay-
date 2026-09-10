import type { Candle, ParseResult } from '../types';

/**
 * Client-side CSV parser. This is the primary path: it runs entirely in
 * the browser (no upload round-trip needed for huge files) and mirrors the
 * backend's column-detection rules exactly, so behavior is identical
 * whether the file is parsed here or via /api/upload-csv.
 */

const FIELD_ALIASES: Record<string, string[]> = {
  datetime: ['datetime', 'date_time', 'date time', 'timestamp', 'date'],
  epoch: ['epoch', 'unix', 'unixtime', 'unix_time', 'time'],
  open: ['open', 'o'],
  high: ['high', 'h'],
  low: ['low', 'l'],
  close: ['close', 'c'],
  volume: ['volume', 'vol', 'v'],
  oi: ['oi', 'openinterest', 'open_interest'],
  symbol: ['symbol', 'ticker', 'instrument'],
  expiry: ['expiry', 'expiration', 'expiry_date'],
  strike: ['strike', 'strike_price'],
  exchange: ['exchange', 'exch'],
};

const REQUIRED_OHLC = ['open', 'high', 'low', 'close'] as const;

export class CsvParseError extends Error {}

function splitCsvLine(line: string): string[] {
  // Handles quoted fields with embedded commas; adequate for standard CSV export.
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function buildHeaderMap(headers: string[]): Record<string, number> {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const map: Record<string, number> = {};
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx !== -1) {
        map[canonical] = idx;
        break;
      }
    }
  }
  return map;
}

const DATETIME_PATTERNS: Array<{ re: RegExp; toEpoch: (m: RegExpMatchArray) => number }> = [
  {
    // dd-mm-yyyy HH:MM:SS  or  dd/mm/yyyy HH:MM:SS
    re: /^(\d{2})[-/](\d{2})[-/](\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/,
    toEpoch: (m) =>
      Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], m[6] ? +m[6] : 0) / 1000,
  },
  {
    // yyyy-mm-dd HH:MM:SS or with T separator
    re: /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?Z?$/,
    toEpoch: (m) =>
      Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0) / 1000,
  },
  {
    // yyyy-mm-dd
    re: /^(\d{4})-(\d{2})-(\d{2})$/,
    toEpoch: (m) => Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000,
  },
];

function parseDatetimeToEpoch(raw: string): number {
  const value = raw.trim();
  for (const { re, toEpoch } of DATETIME_PATTERNS) {
    const m = value.match(re);
    if (m) return Math.floor(toEpoch(m));
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  throw new CsvParseError(`Unrecognized datetime format: '${raw}'`);
}

export function parseCsvText(text: string): ParseResult {
  if (!text || !text.trim()) {
    throw new CsvParseError('The file is empty.');
  }

  // Normalize line endings, strip BOM, drop trailing blank lines.
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    throw new CsvParseError('CSV must contain a header row and at least one data row.');
  }

  const headers = splitCsvLine(lines[0]);
  const headerMap = buildHeaderMap(headers);

  const hasDatetime = headerMap.datetime !== undefined;
  const hasEpoch = headerMap.epoch !== undefined;
  if (!hasDatetime && !hasEpoch) {
    throw new CsvParseError("CSV must contain either a 'datetime' or 'epoch' column.");
  }

  const missing = REQUIRED_OHLC.filter((f) => headerMap[f] === undefined);
  if (missing.length > 0) {
    throw new CsvParseError(`CSV is missing required column(s): ${missing.join(', ')}.`);
  }

  const candles: Candle[] = [];
  const warnings: ParseResult['warnings'] = [];
  const seenTimes = new Set<number>();
  let lastTime: number | null = null;

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = splitCsvLine(lines[i]);

    try {
      let timeVal: number;
      if (hasEpoch && cols[headerMap.epoch]?.trim()) {
        timeVal = Math.floor(parseFloat(cols[headerMap.epoch]));
        if (Number.isNaN(timeVal)) throw new CsvParseError('invalid epoch');
      } else if (hasDatetime) {
        timeVal = parseDatetimeToEpoch(cols[headerMap.datetime] ?? '');
      } else {
        warnings.push({ row: rowNum, message: 'Row missing time value, skipped.' });
        continue;
      }

      const num = (field: string): number => {
        const raw = cols[headerMap[field]];
        if (raw === undefined || raw.trim() === '') throw new CsvParseError(`missing ${field}`);
        const v = parseFloat(raw);
        if (Number.isNaN(v)) throw new CsvParseError(`invalid ${field}`);
        return v;
      };

      const open = num('open');
      const high = num('high');
      const low = num('low');
      const close = num('close');

      if (seenTimes.has(timeVal)) {
        warnings.push({ row: rowNum, message: `Duplicate timestamp ${timeVal}, skipped.` });
        continue;
      }
      if (lastTime !== null && timeVal < lastTime) {
        warnings.push({ row: rowNum, message: `Out-of-order timestamp ${timeVal}, skipped.` });
        continue;
      }
      seenTimes.add(timeVal);
      lastTime = timeVal;

      const volume =
        headerMap.volume !== undefined && cols[headerMap.volume]?.trim()
          ? parseFloat(cols[headerMap.volume])
          : null;
      const oi =
        headerMap.oi !== undefined && cols[headerMap.oi]?.trim()
          ? parseFloat(cols[headerMap.oi])
          : null;
      const strike =
        headerMap.strike !== undefined && cols[headerMap.strike]?.trim()
          ? parseFloat(cols[headerMap.strike])
          : null;

      candles.push({
        time: timeVal,
        open,
        high,
        low,
        close,
        volume: Number.isNaN(volume as number) ? null : volume,
        oi: Number.isNaN(oi as number) ? null : oi,
        symbol: headerMap.symbol !== undefined ? cols[headerMap.symbol] || null : null,
        expiry: headerMap.expiry !== undefined ? cols[headerMap.expiry] || null : null,
        strike: Number.isNaN(strike as number) ? null : strike,
        exchange: headerMap.exchange !== undefined ? cols[headerMap.exchange] || null : null,
      });
    } catch (err) {
      warnings.push({
        row: rowNum,
        message: `Skipped invalid row: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  if (candles.length === 0) {
    throw new CsvParseError('No valid candle rows were found in the file.');
  }

  return {
    candles,
    total: candles.length,
    warnings,
    columns_detected: Object.fromEntries(
      Object.entries(headerMap).map(([k, idx]) => [k, headers[idx]])
    ),
  };
}
