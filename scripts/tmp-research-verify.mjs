import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.POLY_APP_DB_PATH ?? "data/app/app.sqlite";
const address =
  process.argv[2] ?? "0xcd30457c790d8b35a08bcf3f894ad6bb52bc2dd0";
const maxTrades = Number(process.argv[3] ?? 2000);
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");

const now = Math.floor(Date.now() / 1000);
const id = `res_verify_${now}_${Math.floor(Math.random() * 10000)}`;
db.prepare(
  `INSERT INTO trader_research_runs
     (id, address, status, max_trades, created_by, created_at,
      progress_trades, enriched_trades, truncated)
   VALUES (?, ?, 'QUEUED', ?, NULL, ?, 0, 0, 0)`,
).run(id, address.toLowerCase(), maxTrades, now);
console.log("queued", id);

let run = null;
for (let attempt = 0; attempt < 90; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  run = db
    .prepare(
      `SELECT status, progress_trades, enriched_trades, total_expected,
              truncated, error, summary_json
       FROM trader_research_runs WHERE id = ?`,
    )
    .get(id);
  console.log(
    "poll",
    attempt,
    run?.status,
    run?.progress_trades,
    run?.enriched_trades,
    run?.error ?? "",
  );
  if (run?.status === "COMPLETE" || run?.status === "ERROR") break;
}

if (run?.status !== "COMPLETE") {
  console.error("run did not complete", run);
  db.close();
  process.exit(1);
}

const trades = db
  .prepare(
    `SELECT COUNT(*) AS c,
            SUM(CASE WHEN mid_at_fill IS NOT NULL THEN 1 ELSE 0 END) AS covered,
            SUM(CASE WHEN markout_end IS NOT NULL THEN 1 ELSE 0 END) AS end_covered
     FROM trader_research_trades WHERE run_id = ?`,
  )
  .get(id);
const sample = db
  .prepare(
    `SELECT slug, outcome, side, price, entry_edge, markout_1s,
            markout_10s, markout_60s, markout_end, elapsed
     FROM trader_research_trades WHERE run_id = ?
     ORDER BY trade_ts DESC LIMIT 5`,
  )
  .all(id);
const summary = JSON.parse(run.summary_json);
console.log(
  JSON.stringify(
    {
      id,
      trades,
      summary: {
        coverage: summary.coverage,
        overall: summary.markout.overall,
        byWindow: summary.markout.byWindow,
        pair: summary.pair,
        tags: summary.tags,
        lifetime: summary.lifetime
          ? {
              tradeCount: summary.lifetime.tradeCount,
              volumeUsd: summary.lifetime.volumeUsd,
              economicPnl: summary.lifetime.economicPnl,
              makerRebate: summary.lifetime.makerRebate,
            }
          : null,
        standing: summary.standing,
      },
      sample,
    },
    null,
    2,
  ),
);
db.close();
