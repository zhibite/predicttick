#!/usr/bin/env python3
"""Rebuild rollups and the retention index for an offline history build DB.

Run after import-history-dataset.py and before swapping the build DB into
service. This is intentionally separate from the live app so the long
aggregation does not block collection.
"""
import argparse
import os
import sqlite3
import sys
import time

UP = "COALESCE(up_mid, up_last, (up_bid + up_ask) / 2.0)"
DOWN = "COALESCE(down_mid, down_last, (down_bid + down_ask) / 2.0)"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    args = parser.parse_args()
    if not os.path.exists(args.db):
        print(f"database not found: {args.db}", file=sys.stderr)
        return 2

    conn = sqlite3.connect(args.db, timeout=60, isolation_level=None)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA cache_size = -400000")
    now = int(time.time())

    samples = conn.execute("SELECT COUNT(*) FROM samples").fetchone()[0]
    markets = conn.execute("SELECT COUNT(*) FROM markets").fetchone()[0]
    print(f"[finalize] start: markets={markets:,} samples={samples:,}")

    started = time.time()
    conn.execute("DELETE FROM market_stats")
    conn.execute(
        f"""
        INSERT INTO market_stats
          (slug, sample_count, first_ts, last_ts,
           up_open, up_high, up_low, up_close,
           down_open, down_high, down_low, down_close, computed_at)
        SELECT slug, COUNT(*), MIN(ts), MAX(ts),
               NULL, MAX({UP}), MIN({UP}), NULL,
               NULL, MAX({DOWN}), MIN({DOWN}), NULL, ?
        FROM samples
        GROUP BY slug
        """,
        (now,),
    )
    print(f"[finalize] market_stats: {time.time() - started:.1f}s")

    started = time.time()
    conn.execute("DELETE FROM series_days")
    conn.execute(
        """
        INSERT INTO series_days
          (asset, period, day, markets, resolved, samples, updated_at)
        SELECT m.asset, m.period,
               strftime('%Y-%m-%d', m.start_epoch, 'unixepoch'),
               COUNT(*),
               SUM(CASE WHEN m.resolved IN ('UP', 'DOWN') THEN 1 ELSE 0 END),
               COALESCE(SUM(ms.sample_count), 0),
               ?
        FROM markets m
        LEFT JOIN market_stats ms ON ms.slug = m.slug
        GROUP BY m.asset, m.period,
                 strftime('%Y-%m-%d', m.start_epoch, 'unixepoch')
        """,
        (now,),
    )
    print(f"[finalize] series_days: {time.time() - started:.1f}s")

    conn.execute(
        "UPDATE stats SET samples_total = (SELECT COUNT(*) FROM samples) WHERE id = 1"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples(ts)")
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.execute("PRAGMA journal_mode = DELETE")
    conn.close()

    print("[finalize] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
