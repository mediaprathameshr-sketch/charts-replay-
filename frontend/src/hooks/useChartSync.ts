import { useCallback, useRef } from 'react';
import type { MouseEventParams, Time } from 'lightweight-charts';
import type { ChartPanelHandle } from '../components/ChartPanel';

type Range = { from: Time; to: Time } | null;

/**
 * Keeps two ChartPanel instances in lockstep: moving the crosshair, zooming,
 * or scrolling one drives the other. A single `isSyncing` guard prevents the
 * mirrored update from bouncing back and causing an infinite loop.
 */
export function useChartSync(
  leftRef: React.RefObject<ChartPanelHandle>,
  rightRef: React.RefObject<ChartPanelHandle>
) {
  const isSyncing = useRef(false);

  const withGuard = (fn: () => void) => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    try {
      fn();
    } finally {
      // Release on next tick so lightweight-charts' own event dispatch
      // (triggered synchronously by our mirrored call) doesn't re-enter.
      queueMicrotask(() => {
        isSyncing.current = false;
      });
    }
  };

  const mirrorCrosshair = useCallback(
    (target: React.RefObject<ChartPanelHandle>) =>
      (param: MouseEventParams) => {
        withGuard(() => {
          const targetChart = target.current?.getChart();
          const targetSeries = target.current?.getSeries();
          if (!targetChart || !targetSeries) return;

          if (param.point === undefined || param.time === undefined) {
            targetChart.clearCrosshairPosition();
            return;
          }
          // Move the target chart's crosshair to the same time coordinate.
          targetChart.setCrosshairPosition(0, param.time, targetSeries);
        });
      },
    []
  );

  const mirrorVisibleRange = useCallback(
    (target: React.RefObject<ChartPanelHandle>) => (range: Range) => {
      withGuard(() => {
        const targetChart = target.current?.getChart();
        if (!targetChart || !range) return;
        targetChart.timeScale().setVisibleRange(range);
      });
    },
    []
  );

  const onLeftCrosshairMove = mirrorCrosshair(rightRef);
  const onRightCrosshairMove = mirrorCrosshair(leftRef);
  const onLeftVisibleRangeChange = mirrorVisibleRange(rightRef);
  const onRightVisibleRangeChange = mirrorVisibleRange(leftRef);

  return {
    onLeftCrosshairMove,
    onRightCrosshairMove,
    onLeftVisibleRangeChange,
    onRightVisibleRangeChange,
  };
}
