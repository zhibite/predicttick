#!/usr/bin/env python3
"""Import the authoritative future.news history dataset into a market DB.

The target should be an offline copy of the live market DB. Rows are inserted
with INSERT OR IGNORE so live samples win on duplicate (slug, ts).

Dataset layout:
  dataset/all_markets.csv.gz
  dataset/asset=<asset>/period=<5m|15m>/date=<day>/klines.csv.gz

Usage:
  python3 scripts/import-history-dataset.py \
    --dataset /opt/polyklines-history/dataset \
    --db /opt/polyklines-history/build.sqlite
"""
import argparse
import csv
import glob
import gzip
import os
import sqlite3
import sys
import time


MARKET_INSERT = """
INSERT OR IGNORE INTO markets
  (slug, asset, period, start_epoch, end_epoch, condition_id,
   up_token, down_token, title, resolved, discovered_at, finalized_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

SAMPLE_INSERT = """
INSERT OR IGNORE INTO samples
  (slug, ts, up_bid, up_ask, up_mid, up_last,
   down_bid, down_ask, down_mid, down_last)
VALUES (?, ?, NULL, NULL, ?, ?, NULL, NULL, ?, ?)
"""


def parse_float(value):
    value = (value or "").strip()
    if value == "":
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    if number != number:  # NaN
        return None
    return number


def open_db(path):
    conn = sqlite3.connect(path, timeout=60, isolation_level=None)
    conn.execute("PRAGMA journal_mode = OFF")
    conn.execute("PRAGMA synchronous = OFF")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA cache_size = -200000")
    conn.execute("PRAGMA locking_mode = EXCLUSIVE")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS history_import_files (
          name TEXT PRIMARY KEY,
          rows INTEGER NOT NULL,
          imported_at INTEGER NOT NULL
        )
        """
    )
    return conn


def completed_files(conn):
    return {
        row[0]
        for row in conn.execute("SELECT name FROM history_import_files").fetchall()
    }


def mark_done(conn, name, rows):
    conn.execute(
        "INSERT OR REPLACE INTO history_import_files (name, rows, imported_at) VALUES (?, ?, ?)",
        (name, rows, int(time.time())),
    )
    conn.commit()


def import_markets(conn, dataset, done):
    path = os.path.join(dataset, "all_markets.csv.gz")
    name = "all_markets"
    if name in done:
        print("[import] all_markets already imported, skipping")
        return 0
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    print(f"[import] markets <- {path}")
    started = time.time()
    batch = []
    rows = 0
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            slug = (row.get("slug") or "").strip()
            if not slug:
                continue
            start_epoch = int(float(row["start_epoch"]))
            end_epoch = int(float(row["end_epoch"]))
            resolved = (row.get("resolved") or "").strip().upper()
            if resolved not in ("UP", "DOWN"):
                resolved = "UNKNOWN"
            batch.append(
                (
                    slug,
                    (row.get("asset") or "").strip(),
                    (row.get("period") or "").strip(),
                    start_epoch,
                    end_epoch,
                    (row.get("condition_id") or "").strip() or None,
                    (row.get("up_token") or "").strip() or None,
                    (row.get("down_token") or "").strip() or None,
                    (row.get("title") or "").strip() or None,
                    resolved,
                    start_epoch,
                    end_epoch if resolved != "UNKNOWN" else None,
                )
            )
            rows += 1
            if len(batch) >= 10000:
                conn.executemany(MARKET_INSERT, batch)
                conn.commit()
                batch.clear()
    if batch:
        conn.executemany(MARKET_INSERT, batch)
        conn.commit()
    mark_done(conn, name, rows)
    print(f"[import] markets done: {rows} rows in {time.time() - started:.1f}s")
    return rows


def import_klines(conn, dataset, done):
    pattern = os.path.join(dataset, "asset=*", "period=*", "date=*", "klines.csv.gz")
    files = sorted(glob.glob(pattern))
    if not files:
        raise RuntimeError(f"no klines files found under {dataset}")
    total_files = len(files)
    print(f"[import] {total_files} kline partitions; {len(done)} already recorded")
    started = time.time()
    total_rows = 0
    completed = 0

    for index, path in enumerate(files, start=1):
        rel = os.path.relpath(path, dataset)
        if rel in done:
            completed += 1
            continue
        file_rows = 0
        batch = []
        with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                slug = (row.get("slug") or "").strip()
                time_ms = row.get("time")
                if not slug or not time_ms:
                    continue
                ts = int(int(float(time_ms)) / 1000)
                up = parse_float(row.get("up_price"))
                down = parse_float(row.get("down_price"))
                if up is None and down is None:
                    continue
                batch.append((slug, ts, up, up, down, down))
                file_rows += 1
                if len(batch) >= 50000:
                    conn.executemany(SAMPLE_INSERT, batch)
                    conn.commit()
                    batch.clear()
        if batch:
            conn.executemany(SAMPLE_INSERT, batch)
            conn.commit()
        mark_done(conn, rel, file_rows)
        total_rows += file_rows
        completed += 1

        if index % 10 == 0 or index == total_files:
            elapsed = time.time() - started
            rate = total_rows / elapsed if elapsed > 0 else 0
            print(
                f"[import] {index}/{total_files} files; "
                f"{total_rows:,} rows this run; {rate:,.0f} rows/s; "
                f"{elapsed/60:.1f} min",
                flush=True,
            )

    print(
        f"[import] klines done: {total_rows:,} rows in {time.time() - started:.1f}s"
    )
    return total_rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--db", required=True)
    args = parser.parse_args()

    if not os.path.isdir(args.dataset):
        print(f"dataset not found: {args.dataset}", file=sys.stderr)
        return 2
    if not os.path.exists(args.db):
        print(f"target DB not found: {args.db}", file=sys.stderr)
        return 2

    conn = open_db(args.db)
    done = completed_files(conn)
    market_rows = import_markets(conn, args.dataset, done)
    sample_rows = import_klines(conn, args.dataset, done)
    conn.close()
    print(
        f"[import] finished: markets+{market_rows:,}, samples+{sample_rows:,}; "
        f"target={args.db}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
