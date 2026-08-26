"use client";

export function formatVolume(v: number): string {
  if (!Number.isFinite(v)) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

export function formatTime(epochSec: number): string {
  if (!epochSec || epochSec < 0) return "—";
  const d = new Date(epochSec * 1000);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function formatRange(epochSec: number): string {
  if (!epochSec || epochSec < 0) return "—";
  const d = new Date(epochSec * 1000);
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
