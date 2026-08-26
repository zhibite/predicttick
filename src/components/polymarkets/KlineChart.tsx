/**
 * 轻量级图表组件。
 * - mode='line'    : UP/DOWN 双折线（每侧一个 series）
 * - mode='candle'  : 把秒级 tick 聚合成 5 秒 / 15 秒 / 30 秒 K 线
 *
 * 注：K 线聚合在客户端做；5 分钟窗口最长 ~600 tick，秒级聚合后 ~120 根 K 线，渲染压力小。
 *
 * lightweight-charts v4.x：使用 chart.addLineSeries() / chart.addCandlestickSeries()。
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

type Mode = "line" | "candle";

export interface KlineChartProps {
  up: KlineTick[];
  down: KlineTick[];
  /** K 线聚合秒数（仅 candle 模式生效） */
  bucketSec?: 5 | 15 | 30;
  mode?: Mode;
  height?: number;
  /** 锁定窗口范围（秒，UTC+8 时间戳） */
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
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesUpRef = useRef<ISeriesApi<"Line"> | ISeriesApi<"Candlestick"> | null>(
    null,
  );
  const seriesDownRef = useRef<ISeriesApi<"Line"> | ISeriesApi<"Candlestick"> | null>(
    null,
  );

  // 初始化图表
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || 320;
    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#0f141b" },
        textColor: "#8b949e",
        fontFamily: "Outfit, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      rightPriceScale: {
        borderColor: "#30363d",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#30363d",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
        barSpacing: 4,
        minBarSpacing: 2,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: { color: "#465fff", width: 1, style: 2 },
        horzLine: { color: "#465fff", width: 1, style: 2 },
      },
    });
    chartRef.current = chart;

    let upSeries: ISeriesApi<"Line"> | ISeriesApi<"Candlestick">;
    let downSeries: ISeriesApi<"Line"> | ISeriesApi<"Candlestick">;
    if (mode === "line") {
      upSeries = chart.addLineSeries({
        color: "#3fb950",
        lineWidth: 2,
        priceFormat: { precision: 4, minMove: 0.0001 },
      });
      downSeries = chart.addLineSeries({
        color: "#f85149",
        lineWidth: 2,
        priceFormat: { precision: 4, minMove: 0.0001 },
      });
    } else {
      upSeries = chart.addCandlestickSeries({
        upColor: "#3fb950",
        downColor: "#0e4429",
        borderUpColor: "#3fb950",
        borderDownColor: "#0e4429",
        wickUpColor: "#3fb950",
        wickDownColor: "#3fb950",
        priceFormat: { precision: 4, minMove: 0.0001 },
      });
      downSeries = chart.addCandlestickSeries({
        upColor: "#f85149",
        downColor: "#5a1d1a",
        borderUpColor: "#f85149",
        borderDownColor: "#5a1d1a",
        wickUpColor: "#f85149",
        wickDownColor: "#f85149",
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
  }, [mode, height]);

  // 喂数据
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
        /* 范围超界时忽略 */
      }
    } else if (up.length + down.length > 0) {
      chart.timeScale().fitContent();
    }
  }, [up, down, mode, bucketSec, visibleFromSec, visibleToSec]);

  // 自适应宽度
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
