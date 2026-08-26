"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { KlineTick } from "@/lib/db/klines";
import { assetIcon, fmtBeijingDateTime } from "@/lib/format";

const KlineChart = dynamic(() => import("./KlineChart"), { ssr: false });

export interface WindowCardProps {
  slug: string;
  asset: string;
  period: string;
  startEpoch: number;
  endEpoch: number;
  status: string;
  volume: number;
  up: KlineTick[];
  down: KlineTick[];
  index: number;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  live: { label: "LIVE", cls: "bg-emerald-500/15 text-emerald-400" },
  closed: { label: "CLOSED", cls: "bg-red-500/15 text-red-400" },
  pending: { label: "PENDING", cls: "bg-sky-500/15 text-sky-400" },
  unknown: { label: "—", cls: "bg-zinc-500/15 text-zinc-400" },
};

function statusBadge(status: string) {
  const k = STATUS_LABEL[status] ?? STATUS_LABEL.unknown;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${k.cls}`}
    >
      {k.label}
    </span>
  );
}

export default function WindowCard(props: WindowCardProps) {
  const { slug, asset, period, startEpoch, endEpoch, status, volume, up, down, index } = props;
  const [mode, setMode] = useState<"line" | "candle">("line");

  const summary = useMemo(() => {
    const lastUp = up.length ? up[up.length - 1].p : null;
    const lastDown = down.length ? down[down.length - 1].p : null;
    let upHigh = up.length ? up[0].p : 0;
    let upLow = up.length ? up[0].p : 0;
    let dnHigh = down.length ? down[0].p : 0;
    let dnLow = down.length ? down[0].p : 0;
    for (const t of up) {
      if (t.p > upHigh) upHigh = t.p;
      if (t.p < upLow) upLow = t.p;
    }
    for (const t of down) {
      if (t.p > dnHigh) dnHigh = t.p;
      if (t.p < dnLow) dnLow = t.p;
    }
    return {
      lastUp,
      lastDown,
      upHigh,
      upLow,
      dnHigh,
      dnLow,
      upCount: up.length,
      dnCount: down.length,
    };
  }, [up, down]);

  const windowSec = period === "15m" ? 900 : 300;
  const beijingFrom = startEpoch + 8 * 3600;
  const beijingTo = beijingFrom + windowSec;

  const volumeStr =
    volume >= 1_000_000
      ? `${(volume / 1_000_000).toFixed(2)}M`
      : volume >= 1_000
        ? `${(volume / 1_000).toFixed(1)}K`
        : volume.toFixed(0);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-400">
            {index + 1}
          </span>
          <span className="truncate font-mono text-[12px] text-zinc-200">{slug}</span>
          {statusBadge(status)}
        </div>
        <div className="flex items-center gap-2 text-[12px] font-semibold">
          <span className="text-emerald-400 tabular-nums">
            {summary.lastUp !== null ? summary.lastUp.toFixed(4) : "—"}
          </span>
          <span className="text-zinc-600">/</span>
          <span className="text-red-400 tabular-nums">
            {summary.lastDown !== null ? summary.lastDown.toFixed(4) : "—"}
          </span>
        </div>
      </div>

      {/* Meta line */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-[10px] text-zinc-500 border-b border-zinc-800">
        <span>
          {fmtBeijingDateTime(startEpoch)} → {fmtBeijingDateTime(endEpoch)} · {period.toUpperCase()} · Vol{" "}
          {volumeStr}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("line")}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              mode === "line"
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Line
          </button>
          <button
            onClick={() => setMode("candle")}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              mode === "candle"
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Candle
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="px-1 py-1">
        <KlineChart
          up={up}
          down={down}
          mode={mode}
          bucketSec={5}
          visibleFromSec={beijingFrom}
          visibleToSec={beijingTo}
          height={200}
        />
      </div>

      {/* Legend / summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-t border-zinc-800 text-[10px] text-zinc-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            UP · {summary.upCount} pts · H {summary.upHigh.toFixed(3)} / L {summary.upLow.toFixed(3)}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
            DOWN · {summary.dnCount} pts · H {summary.dnHigh.toFixed(3)} / L {summary.dnLow.toFixed(3)}
          </span>
        </div>
        <span className="text-zinc-600">
          {assetIcon(asset)} {asset.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
