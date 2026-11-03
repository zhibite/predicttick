import { getDb } from "@/server/db";

import type { SampleRow } from "./types";

export function listSamples(slug: string): SampleRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ts, up_bid, up_ask, up_mid, up_last,
              down_bid, down_ask, down_mid, down_last
       FROM samples WHERE slug = ? ORDER BY ts`,
    )
    .all(slug) as unknown as SampleRow[];
}

export function listSamplesInWindow(
  slug: string,
  fromTs: number,
  toTs: number,
): SampleRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ts, up_bid, up_ask, up_mid, up_last,
              down_bid, down_ask, down_mid, down_last
       FROM samples
       WHERE slug = ? AND ts >= ? AND ts < ?
       ORDER BY ts`,
    )
    .all(slug, fromTs, toTs) as unknown as SampleRow[];
}

export function listSamplesPage(options: {
  slug: string;
  fromTs: number;
  toTsExclusive: number;
  cursorTs?: number | null;
  limit: number;
}): SampleRow[] {
  const db = getDb();
  const conditions = ["slug = ?", "ts >= ?", "ts < ?"];
  const args: Array<string | number> = [
    options.slug,
    options.fromTs,
    options.toTsExclusive,
  ];
  if (options.cursorTs != null) {
    conditions.push("ts > ?");
    args.push(options.cursorTs);
  }
  args.push(options.limit);

  return db
    .prepare(
      `SELECT ts, up_bid, up_ask, up_mid, up_last,
              down_bid, down_ask, down_mid, down_last
       FROM samples
       WHERE ${conditions.join(" AND ")}
       ORDER BY ts
       LIMIT ?`,
    )
    .all(...args) as unknown as SampleRow[];
}

const SAMPLE_COLUMNS = `ts, up_bid, up_ask, up_mid, up_last,
              down_bid, down_ask, down_mid, down_last`;

const SAMPLE_COLUMNS_WITH_SOURCE = `${SAMPLE_COLUMNS}, source`;

/** Real collector rows plus future.news reconstructions, live wins on overlap. */
export function listSamplesWithBackfill(slug: string): SampleRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ${SAMPLE_COLUMNS_WITH_SOURCE}
       FROM samples_all WHERE slug = ? ORDER BY ts`,
    )
    .all(slug) as unknown as SampleRow[];
}

export function listSamplesInWindowWithBackfill(
  slug: string,
  fromTs: number,
  toTs: number,
): SampleRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ${SAMPLE_COLUMNS_WITH_SOURCE}
       FROM samples_all
       WHERE slug = ? AND ts >= ? AND ts < ?
       ORDER BY ts`,
    )
    .all(slug, fromTs, toTs) as unknown as SampleRow[];
}

export function listSamplesPageWithBackfill(options: {
  slug: string;
  fromTs: number;
  toTsExclusive: number;
  cursorTs?: number | null;
  limit: number;
}): SampleRow[] {
  const db = getDb();
  const conditions = ["slug = ?", "ts >= ?", "ts < ?"];
  const args: Array<string | number> = [
    options.slug,
    options.fromTs,
    options.toTsExclusive,
  ];
  if (options.cursorTs != null) {
    conditions.push("ts > ?");
    args.push(options.cursorTs);
  }
  args.push(options.limit);

  return db
    .prepare(
      `SELECT ${SAMPLE_COLUMNS_WITH_SOURCE}
       FROM samples_all
       WHERE ${conditions.join(" AND ")}
       ORDER BY ts
       LIMIT ?`,
    )
    .all(...args) as unknown as SampleRow[];
}

export function countSamples(slug: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM samples WHERE slug = ?")
    .get(slug) as unknown as { n: number } | undefined;
  return row?.n ?? 0;
}
