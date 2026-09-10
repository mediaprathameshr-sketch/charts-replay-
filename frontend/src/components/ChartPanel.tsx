import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  createChart,
  CrosshairMode,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { CandlestickPoint } from '../types';

export interface ChartPanelHandle {
  getChart: () => IChartApi | null;
  getSeries: () => ISeriesApi<'Candlestick'> | null;
  /** Full reset: replaces all visible bars (used on load / reset / stepping backward). */
  setData: (bars: CandlestickPoint[]) => void;
  /** Upsert a single bar — updates it in place if its time matches the last bar, else appends. O(1). */
  updateBar: (bar: CandlestickPoint) => void;
  fitContent: () => void;
  focusReplayCandle: (index: number) => void;
}

/** Our data uses plain Unix-epoch numbers; lightweight-charts wants its own Time type. */
function toCandlestickData(bar: CandlestickPoint): CandlestickData {
  return {
    time: bar.time as UTCTimestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

interface ChartPanelProps {
  title: string;
  accent: string;
  pricePrecision: number;
  onCrosshairMove?: (param: MouseEventParams) => void;
  onVisibleRangeChange?: (range: { from: Time; to: Time } | null) => void;
}

/**
 * A single candlestick chart. Deliberately dumb about *what* data means
 * (replay state, HA vs standard) — it just renders bars it's given and
 * reports user interaction upward for the sync hook to mirror.
 */
const ChartPanel = forwardRef<ChartPanelHandle, ChartPanelProps>(
  ({ title, accent, pricePrecision, onCrosshairMove, onVisibleRangeChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;

      const chart = createChart(containerRef.current, {
        layout: {
          background: { color: 'transparent' },
          textColor: '#a7b0c0',
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#161b26' },
          horzLines: { color: '#161b26' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: '#3a4457', labelBackgroundColor: '#232c3d' },
          horzLine: { color: '#3a4457', labelBackgroundColor: '#232c3d' },
        },
        rightPriceScale: { borderColor: '#1a212e' },
        timeScale: { borderColor: '#1a212e', timeVisible: true, secondsVisible: false },
        autoSize: true,
      });

      const series = chart.addCandlestickSeries({
        upColor: '#35b8a6',
        downColor: '#e2584f',
        borderUpColor: '#35b8a6',
        borderDownColor: '#e2584f',
        wickUpColor: '#2f8f83',
        wickDownColor: '#b8453e',
        priceFormat: {
          type: 'price',
          precision: pricePrecision,
          minMove: 1 / 10 ** pricePrecision,
        },
      });

      chartRef.current = chart;
      seriesRef.current = series;

      if (onCrosshairMove) {
        chart.subscribeCrosshairMove(onCrosshairMove);
      }
      if (onVisibleRangeChange) {
        chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
          onVisibleRangeChange(range as { from: Time; to: Time } | null);
        });
      }

      return () => {
        chart.remove();
        chartRef.current = null;
        seriesRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      seriesRef.current?.applyOptions({
        priceFormat: {
          type: 'price',
          precision: pricePrecision,
          minMove: 1 / 10 ** pricePrecision,
        },
      });
    }, [pricePrecision]);

    useImperativeHandle(ref, () => ({
      getChart: () => chartRef.current,
      getSeries: () => seriesRef.current,
      setData: (bars) => {
        seriesRef.current?.setData(bars.map(toCandlestickData));
      },
      updateBar: (bar) => {
        seriesRef.current?.update(toCandlestickData(bar));
      },
      fitContent: () => {
        chartRef.current?.timeScale().fitContent();
      },
      focusReplayCandle: (index) => {
        const chart = chartRef.current;
        if (!chart) return;

        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, index - 50),
          to: index + 50,
        });
        chart.priceScale('right').applyOptions({ autoScale: true });
      },
    }));

    return (
      <div className="chart-panel">
        <div className="chart-panel__header" style={{ borderColor: accent }}>
          <span className="chart-panel__dot" style={{ background: accent }} />
          <span className="chart-panel__title">{title}</span>
        </div>
        <div className="chart-panel__surface" ref={containerRef} />
      </div>
    );
  }
);

ChartPanel.displayName = 'ChartPanel';

export default ChartPanel;
