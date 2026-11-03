const NUMBER = new Intl.NumberFormat("en-US");
const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const UTC_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const UTC_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const ASSET_LABELS: Record<string, string> = {
  btc: "Bitcoin",
  eth: "Ethereum",
  bnb: "BNB",
  sol: "Solana",
  doge: "Dogecoin",
  xrp: "XRP",
  hype: "Hyperliquid",
};

export function assetLabel(asset: string): string {
  return ASSET_LABELS[asset] ?? asset.toUpperCase();
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return NUMBER.format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return COMPACT.format(value);
}

export function formatPercent(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatUtcTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return UTC_TIME.format(date);
}

export function formatUtcDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return UTC_DATE.format(date);
}

export function formatDateRange(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  if (!first || !last) return "—";
  if (first === last) return formatUtcDate(first);
  return `${formatUtcDate(first)} – ${formatUtcDate(last)}`;
}

export function formatClock(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(11, 19);
}

export function formatDateFromEpoch(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}
