"""
FastAPI backend for the OHLC Replay app.

Deliberately small: one endpoint to upload+parse a CSV, one to compute
Heiken Ashi for an already-parsed candle set. Replay, sync, and rendering
all happen in the browser.

Run with:
    uvicorn main:app --reload
"""
from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from csv_loader import CsvParseError, parse_csv_bytes
from heiken import to_heiken_ashi
from models import Candle, ErrorResponse, ParseResult

app = FastAPI(
    title="OHLC Replay API",
    description="Minimal backend for CSV parsing and Heiken Ashi generation.",
    version="1.0.0",
)

# Vite dev server defaults to 5173; allow any localhost port during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/api/upload-csv",
    response_model=ParseResult,
    responses={400: {"model": ErrorResponse}},
)
async def upload_csv(file: UploadFile = File(...)) -> ParseResult:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file.")

    raw = await file.read()
    try:
        return parse_csv_bytes(raw)
    except CsvParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - safety net
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {exc}") from exc


@app.post("/api/heiken-ashi", response_model=list[Candle])
async def heiken_ashi(candles: list[Candle]) -> list[Candle]:
    if not candles:
        raise HTTPException(status_code=400, detail="No candles provided.")
    return to_heiken_ashi(candles)
