import { PERIODS } from "@/lib/types";
import type { Period } from "@/lib/types";
import { getCoverage } from "@/server/query/coverage";
import { listExportMarkets } from "@/server/query/markets";
import { listSamplesInWindow } from "@/server/query/samples";
import type { ExportMarketRow, SampleRow } from "@/server/query/types";

export type ExportDataset = "samples" | "markets";
export type ExportInterval = "raw" | "5s" | "1m" | "5m";
export type ExportFormat = "csv" | "csv.gz";

export interface ExportFilters {
  asset: string;
  period: Period;
  from: string;
  to: string;
  dataset: ExportDataset;
  resolvedOnly: boolean;
  interval: ExportInterval;
  format: ExportFormat;
}

export interface ExportEstimate {
  markets: number;
  rows: number;
  bytes: number;
}

const SAFE_ASSET = /^[a-z0-9]+$/;
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const INTERVALS: ExportInterval[] = ["raw", "5s", "1m", "5m"];
const DATASETS: ExportDataset[] = ["samples", "markets"];
const FORMATS: ExportFormat[] = ["csv", "csv.gz"];

export function dateToEpoch(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
}

function iso(epoch: number): string {
  return new Date(epoch * 1000).toISOString();
}

function csvValue(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function parseExportFilters(
  input: Record<string, string | undefined>,
): { filters?: ExportFilters; error?: string } {
  const asset = (input.asset ?? "").trim().toLowerCase();
  const period = (input.period ?? "") as Period;
  const from = (input.from ?? "").trim();
  const to = (input.to ?? "").trim();
  const dataset = (input.dataset ?? "samples") as ExportDataset;
  const interval = (input.interval ?? "raw") as ExportInterval;
  const format = (input.format ?? "csv") as ExportFormat;
  const resolvedOnly = input.resolved === "1" || input.resolved === "true";

  if (!SAFE_ASSET.test(asset)) return { error: "Invalid asset." };
  if (!PERIODS.includes(period)) return { error: "Invalid period." };
  if (!SAFE_DATE.test(from) || !SAFE_DATE.test(to)) {
    return { error: "Dates must use YYYY-MM-DD." };
  }
  const fromEpoch = dateToEpoch(from);
  const toEpoch = dateToEpoch(to);
  if (!Number.isFinite(fromEpoch) || !Number.isFinite(toEpoch)) {
    return { error: "Invalid date." };
  }
  if (fromEpoch > toEpoch) return { error: "Start date must be before end date." };
  if (!DATASETS.includes(dataset)) return { error: "Invalid dataset." };
  if (!INTERVALS.includes(interval)) return { error: "Invalid interval." };
  if (!FORMATS.includes(format)) return { error: "Invalid format." };

  return {
    filters: {
      asset,
      period,
      from,
      to,
      dataset,
      resolvedOnly,
      interval: dataset === "markets" ? "raw" : interval,
      format,
    },
  };
}

export function exportFilename(filters: ExportFilters): string {
  const interval =
    filters.dataset === "samples" && filters.interval !== "raw"
      ? `_${filters.interval}`
      : "";
  const extension = filters.format === "csv.gz" ? "csv.gz" : "csv";
  return `polyklines_${filters.asset}_${filters.period}_${filters.from}_${filters.to}_${filters.dataset}${interval}.${extension}`;
}

export function estimateExport(filters: ExportFilters): ExportEstimate {
  const coverage = getCoverage(
    filters.asset,
    filters.period,
    filters.from,
    filters.to,
  );
  if (filters.dataset === "markets") {
    return {
      markets: coverage.markets,
      rows: coverage.markets,
      bytes: coverage.markets * 220,
    };
  }
  return {
    markets: coverage.markets,
    rows: coverage.samples,
    // ~120 bytes per sample row including market metadata.
    bytes: coverage.samples * 120,
  };
}

function sampleLine(
  market: ExportMarketRow,
  sample: SampleRow,
): string {
  return [
    market.slug,
    market.asset,
    market.period,
    iso(market.start_epoch),
    iso(market.end_epoch),
    market.resolved ?? "UNKNOWN",
    sample.ts,
    iso(sample.ts),
    sample.up_bid,
    sample.up_ask,
    sample.up_mid,
    sample.up_last,
    sample.down_bid,
    sample.down_ask,
    sample.down_mid,
    sample.down_last,
  ]
    .map(csvValue)
    .join(",");
}

function marketLine(market: ExportMarketRow): string {
  return [
    market.slug,
    market.asset,
    market.period,
    market.start_epoch,
    market.end_epoch,
    iso(market.start_epoch),
    iso(market.end_epoch),
    market.title,
    market.resolved ?? "UNKNOWN",
    market.finalized_at,
    market.condition_id,
    market.up_token,
    market.down_token,
  ]
    .map(csvValue)
    .join(",");
}

const SAMPLE_HEADER = [
  "slug",
  "asset",
  "period",
  "window_start_utc",
  "window_end_utc",
  "resolved",
  "ts",
  "ts_utc",
  "up_bid",
  "up_ask",
  "up_mid",
  "up_last",
  "down_bid",
  "down_ask",
  "down_mid",
  "down_last",
].join(",");

const MARKET_HEADER = [
  "slug",
  "asset",
  "period",
  "start_epoch",
  "end_epoch",
  "start_utc",
  "end_utc",
  "title",
  "resolved",
  "finalized_at",
  "condition_id",
  "up_token",
  "down_token",
].join(",");

const INTERVAL_SECONDS: Record<Exclude<ExportInterval, "raw">, number> = {
  "5s": 5,
  "1m": 60,
  "5m": 300,
};

/**
 * Yield CSV lines one at a time. Callers either stream them to HTTP or pipe
 * them into a gzip file for a background export.
 */
export async function* iterateCsv(
  filters: ExportFilters,
): AsyncGenerator<string> {
  yield `${filters.dataset === "markets" ? MARKET_HEADER : SAMPLE_HEADER}\n`;

  const fromEpoch = dateToEpoch(filters.from);
  const toEpoch = dateToEpoch(filters.to) + 86_400;
  let lines = 0;

  for (let dayStart = fromEpoch; dayStart < toEpoch; dayStart += 86_400) {
    const dayEnd = Math.min(dayStart + 86_400, toEpoch);
    const markets = listExportMarkets(
      filters.asset,
      filters.period,
      dayStart,
      dayEnd,
      filters.resolvedOnly,
    );

    for (const market of markets) {
      if (filters.dataset === "markets") {
        yield `${marketLine(market)}\n`;
        lines += 1;
      } else {
        const samples = listSamplesInWindow(
          market.slug,
          market.start_epoch,
          market.end_epoch,
        );
        if (filters.interval === "raw") {
          for (const sample of samples) {
            yield `${sampleLine(market, sample)}\n`;
            lines += 1;
          }
        } else {
          const bucketSeconds = INTERVAL_SECONDS[filters.interval];
          const buckets = new Map<number, SampleRow>();
          for (const sample of samples) {
            const bucket = Math.floor(sample.ts / bucketSeconds) * bucketSeconds;
            buckets.set(bucket, sample);
          }
          for (const sample of buckets.values()) {
            yield `${sampleLine(market, sample)}\n`;
            lines += 1;
          }
        }
      }

      if (lines > 0 && lines % 2_000 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
  }
}

