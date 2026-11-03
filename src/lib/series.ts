import type { KlinePoint, WindowResponse } from "@/lib/types";

export interface ChartPoint extends KlinePoint {
  /** Sampling interval for this point. */
  resolution: "1s" | "5s" | "10s" | "30s";
}

export interface ChartSeries {
  rows: ChartPoint[];
  up: [number, number | null][];
  down: [number, number | null][];
  /** True when the 1s fine series replaced the coarse tail. */
  usingFine: boolean;
}

/**
 * Build chart rows for a market window. 15m markets carry an extra 1s series
 * covering the final five minutes; when `showFine` is on it replaces the 5s
 * samples in that tail.
 *
 * The source series is often shifted later than the market window (its first
 * sample arrives 45-85 s after the open, and the tail runs past the close).
 * The chart is a market-window chart, so samples outside [start, end] are
 * dropped: the opening gap stays empty and post-close settlement samples are
 * excluded.
 */
export function buildSeries(
  data: WindowResponse,
  showFine: boolean,
): ChartSeries {
  const windowStart = data.startEpoch * 1000;
  const windowEnd = data.endEpoch * 1000;
  const inWindow = (point: KlinePoint) =>
    point.t >= windowStart && point.t <= windowEnd;

  const fineInWindow = (data.fine ?? []).filter(inWindow);
  const usingFine = showFine && fineInWindow.length > 0;
  // Switch to the 1s series at its first in-window sample so there is no gap.
  const fineStart = usingFine ? fineInWindow[0].t : Infinity;

  const main = data.points.filter(
    (point) => inWindow(point) && point.t < fineStart,
  );
  const tail = usingFine ? fineInWindow : [];

  const coarseResolution: ChartPoint["resolution"] =
    data.period === "5m"
      ? "1s"
      : data.period === "15m"
        ? "5s"
        : data.period === "1h"
          ? "10s"
          : "30s";
  const rows: ChartPoint[] = [
    ...main.map(
      (point): ChartPoint => ({ ...point, resolution: coarseResolution }),
    ),
    ...tail.map((point): ChartPoint => ({ ...point, resolution: "1s" })),
  ].sort((a, b) => a.t - b.t);

  return {
    rows,
    up: rows.map((point) => [point.t, point.up]),
    down: rows.map((point) => [point.t, point.down]),
    usingFine,
  };
}

export interface WindowStats {
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  samples: number;
}

export function summarize(series: ChartSeries): WindowStats {
  let open: number | null = null;
  let close: number | null = null;
  let high: number | null = null;
  let low: number | null = null;

  for (const point of series.rows) {
    if (point.up == null) continue;
    if (open == null) open = point.up;
    close = point.up;
    high = high == null ? point.up : Math.max(high, point.up);
    low = low == null ? point.up : Math.min(low, point.up);
  }

  return {
    open,
    close,
    high,
    low,
    samples: series.rows.length,
  };
}
