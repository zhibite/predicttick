/**
 * Lightweight chart component.
 * - mode='line'    : UP/DOWN dual line series
 * - mode='candle'  : Aggregates tick data into 5s / 15s / 30s candles
 *
 * Chart colors adapt to TailAdmin light/dark theme via ThemeContext.
 */
"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { KlineTick } from "@/lib/db/klines";
import { msToBeijingSec } from "@/lib/format";
import { useTheme } from "@/context/ThemeContext";

type Mode = "line" | "candle";

export interface KlineChartProps {
  up: KlineTick[];
  down: KlineTick[];
  bucketSec?: 5 | 15 | 30;
  mode?: Mode;
  height?: number;
  visibleFromSec?: number;
  visibleToSec?: number;
  className?: string;
}

interface CandleBar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

function aggregate(ticks: KlineTick[], bucketSec: number): CandleBar[] {
  if (ticks.length === 0) return [];
  const buckets = new Map<number, KlineTick[]>();
  for (const t of ticks) {
    const tSec = Math.floor(t.t / 1000);
    const k = Math.floor(tSec / bucketSec) * bucketSec;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
  const bars: CandleBar[] = [];
  for (const k of sortedKeys) {
    const arr = buckets.get(k)!;
    const open = arr[0].p;
    const close = arr[arr.length - 1].p;
    let high = open;
    let low = open;
    for (const t of arr) {
      if (t.p > high) high = t.p;
      if (t.p < low) low = t.p;
    }
    bars.push({
      time: msToBeijingSec(k * 1000) as UTCTimestamp,
      open,
      high,
      low,
      close,
    });
  }
  return bars;
}

const LIGHT = {
  background: "#ffffff",
  textColor: "#475467",
  gridVert: "#e4e7ec",
  gridHorz: "#e4e7ec",
  border: "#e4e7ec",
  crosshair: "#465fff",
  upLine: "#12b76a",
  downLine: "#f04438",
  upCandle: "#12b76a",
  upCandleBorder: "#12b76a",
  upCandleWick: "#12b76a",
  downCandle: "#f04438",
  downCandleBorder: "#f04438",
  downCandleWick: "#f04438",
};

const DARK = {
  background: "#0f141b",
  textColor: "#8b949e",
  gridVert: "#1f2937",
  gridHorz: "#1f2937",
  border: "#30363d",
  crosshair: "#465fff",
  upLine: "#3fb950",
  downLine: "#f85149",
  upCandle: "#3fb950",
  upCandleBorder: "#3fb950",
  upCandleWick: "#3fb950",
  downCandle: "#f85149",
  downCandleBorder: "#f85149",
  downCandleWick: "#f85149",
};

export default function KlineChart({
  up,
  down,
  bucketSec = 5,
  mode = "line",
  height = 200,
  visibleFromSec,
  visibleToSec,
  className,
}: KlineChartProps) {
  const { theme = "light" } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesUpRef = useRef<ISeriesApi<"Line"> | ISeriesApi<"Candlestick"> | null>(null);
  const seriesDownRef = useRef<ISeriesApi<"Line"> | ISeriesApi<"Candlestick"> | null>(null);

  const c = theme === "dark" ? DARK : LIGHT;

  // Init chart
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || 320;

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: c.background },
        textColor: c.textColor,
        fontFamily: "Outfit, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: c.gridVert },
        horzLines: { color: c.gridHorz },
      },
      rightPriceScale: {
        borderColor: c.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: c.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
        barSpacing: 4,
        minBarSpacing: 2,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: { color: c.crosshair, width: 1, style: 2 },
        horzLine: { color: c.crosshair, width: 1, style: 2 },
      },
    });
    chartRef.current = chart;

    let upSeries: ISeriesApi<"Line"> | ISeriesApi<"Candlestick">;
    let downSeries: ISeriesApi<"Line"> | ISeriesApi<"Candlestick">;
    if (mode === "line") {
      upSeries = chart.addLineSeries({
        color: c.upLine,
        lineWidth: 2,
        priceFormat: { precision: 4, minMove: 0.0001 },
      });
      downSeries = chart.addLineSeries({
        color: c.downLine,
        lineWidth: 2,
        priceFormat: { precision: 4, minMove: 0.0001 },
      });
    } else {
      upSeries = chart.addCandlestickSeries({
        upColor: c.upCandle,
        downColor: c.downCandle,
        borderUpColor: c.upCandleBorder,
        borderDownColor: c.downCandleBorder,
        wickUpColor: c.upCandleWick,
        wickDownColor: c.downCandleWick,
        priceFormat: { precision: 4, minMove: 0.0001 },
      });
      downSeries = chart.addCandlestickSeries({
        upColor: c.upCandle,
        downColor: c.downCandle,
        borderUpColor: c.upCandleBorder,
        borderDownColor: c.downCandleBorder,
        wickUpColor: c.upCandleWick,
        wickDownColor: c.downCandleWick,
        priceFormat: { precision: 4, minMove: 0.0001 },
      });
    }
    seriesUpRef.current = upSeries;
    seriesDownRef.current = downSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesUpRef.current = null;
      seriesDownRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, height, theme]);

  // Feed data
  useEffect(() => {
    const upSeries = seriesUpRef.current;
    const downSeries = seriesDownRef.current;
    const chart = chartRef.current;
    if (!upSeries || !downSeries || !chart) return;

    try {
      if (mode === "line") {
        const upData = up.map((p) => ({
          time: msToBeijingSec(p.t) as UTCTimestamp,
          value: p.p,
        }));
        const downData = down.map((p) => ({
          time: msToBeijingSec(p.t) as UTCTimestamp,
          value: p.p,
        }));
        (upSeries as ISeriesApi<"Line">).setData(upData);
        (downSeries as ISeriesApi<"Line">).setData(downData);
      } else {
        (upSeries as ISeriesApi<"Candlestick">).setData(aggregate(up, bucketSec));
        (downSeries as ISeriesApi<"Candlestick">).setData(aggregate(down, bucketSec));
      }
    } catch (err) {
      console.warn("setData failed", err);
    }

    if (
      visibleFromSec !== undefined &&
      visibleToSec !== undefined &&
      up.length + down.length > 0
    ) {
      try {
        chart.timeScale().setVisibleRange({
          from: visibleFromSec as UTCTimestamp,
          to: visibleToSec as UTCTimestamp,
        });
      } catch {
        /* range out of bounds — ignore */
      }
    } else if (up.length + down.length > 0) {
      chart.timeScale().fitContent();
    }
  }, [up, down, mode, bucketSec, visibleFromSec, visibleToSec]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;
    const ro = new ResizeObserver(() => {
      chart.resize(container.clientWidth, height);
    });
    ro.observe(container);
    chart.resize(container.clientWidth, height);
    return () => ro.disconnect();
  }, [height]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height }} />;
}
