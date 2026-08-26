/**
 * 数据层烟雾测试：仅在开发期手工运行，CI 不调用。
 * 执行：`npx tsx scripts/test-db.ts`
 */
import { markets, klines, ASSETS } from "../src/lib/db";

function log(label: string, payload: unknown) {
  const s = JSON.stringify(payload, (_, v) =>
    typeof v === "number" ? Math.round(v * 1000) / 1000 : v,
  );
  console.log(`[${label}]`, s.length > 400 ? s.slice(0, 400) + "..." : s);
}

console.log("ASSETS:", ASSETS);
log("stats", markets.getAssetStats());

const page = markets.getMarketsPage("btc", "5m", 3, 5000);
log("page-total", { total: page.total, returned: page.windows.length });
if (page.windows[0]) {
  const w = page.windows[0];
  log("first-window", {
    slug: w.slug,
    start_epoch: w.start_epoch,
    up_token: w.up_token?.slice(0, 12),
    down_token: w.down_token?.slice(0, 12),
  });
  const series = klines.getKlinesByTokens("btc", w.up_token, w.down_token);
  log("series", {
    up: series.up.length,
    down: series.down.length,
    up_first: series.up[0],
    up_last: series.up[series.up.length - 1],
  });
  log("summary-up", klines.summarizeSeries(series.up));
  log("summary-down", klines.summarizeSeries(series.down));
}
