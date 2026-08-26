import { ASSETS, PERIODS } from "@/lib/db/constants";

export type SearchableItem = {
  slug: string;
  title: string;
  description: string;
  period: "5m" | "15m";
  asset: string;
  path: string;
  group: "5 Min" | "15 Min";
};

export const SEARCHABLE_ITEMS: SearchableItem[] = (() => {
  const items: SearchableItem[] = [];
  for (const period of PERIODS) {
    for (const asset of ASSETS) {
      const path = `/polymarket?period=${period}&asset=${asset}`;
      items.push({
        slug: `${asset}-${period}`,
        title: `${asset.toUpperCase()} ${period.toUpperCase()} K-Line`,
        description: `Polymarket ${asset.toUpperCase()} ${period === "5m" ? "5-minute" : "15-minute"} UP/DOWN market`,
        period,
        asset,
        path,
        group: period === "5m" ? "5 Min" : "15 Min",
      });
    }
  }
  return items;
})();
