import type { Metadata } from "next";
import Link from "next/link";
import { ASSETS, PERIODS, type Asset } from "@/lib/db/constants";

const ASSET_NAMES: Record<string, string> = {
  btc: "Bitcoin",
  eth: "Ethereum",
  bnb: "BNB",
  sol: "Solana",
  doge: "Dogecoin",
  xrp: "XRP",
  hype: "Hyperliquid",
};

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `Market "${q}" not found | PredictTick` : "Market not found | PredictTick",
  };
}

export default async function NotFoundPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const trimmed = (q ?? "").trim();

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 px-6 py-16 text-center shadow-sm dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-900/60">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/10">
        <svg
          className="h-8 w-8 text-amber-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>

      <h1 className="mt-5 text-2xl font-semibold text-gray-900 dark:text-white">
        No market found
      </h1>

      {trimmed ? (
        <p className="mt-3 max-w-lg text-sm text-gray-500 dark:text-gray-400">
          We couldn&apos;t find a market matching{" "}
          <code className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 dark:bg-zinc-800 dark:text-gray-200">
            {trimmed}
          </code>
          .
        </p>
      ) : (
        <p className="mt-3 max-w-lg text-sm text-gray-500 dark:text-gray-400">
          Please provide a slug to search.
        </p>
      )}

      <div className="mt-6 max-w-lg rounded-lg border border-gray-200 bg-white p-4 text-left dark:border-zinc-700 dark:bg-zinc-900">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Slug format
        </div>
        <p className="mt-2 font-mono text-sm text-gray-700 dark:text-gray-200">
          &lt;asset&gt;-updown-&lt;period&gt;-&lt;start_epoch&gt;
        </p>
        <ul className="mt-3 space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          <li>
            <span className="font-semibold text-gray-700 dark:text-gray-200">asset</span>
            : one of{" "}
            {(ASSETS as readonly string[]).map((a, i) => (
              <span key={a}>
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono dark:bg-zinc-800">
                  {a}
                </code>
                {i < ASSETS.length - 1 ? ", " : ""}
              </span>
            ))}
          </li>
          <li>
            <span className="font-semibold text-gray-700 dark:text-gray-200">period</span>
            :{" "}
            {(PERIODS as readonly string[]).map((p, i) => (
              <span key={p}>
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono dark:bg-zinc-800">
                  {p}
                </code>
                {i < PERIODS.length - 1 ? ", " : ""}
              </span>
            ))}
          </li>
          <li>
            <span className="font-semibold text-gray-700 dark:text-gray-200">start_epoch</span>
            : Unix timestamp in seconds (10 digits)
          </li>
        </ul>
        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Example:{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono dark:bg-zinc-800">
            btc-updown-5m-1787710592
          </code>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {(ASSETS as readonly Asset[]).map((a) => (
          <Link
            key={a}
            href={`/polymarket?period=5m&asset=${a}`}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-200 dark:hover:border-brand-500/30 dark:hover:bg-brand-500/10 dark:hover:text-brand-400"
          >
            {ASSET_NAMES[a] || a.toUpperCase()} 5m
          </Link>
        ))}
      </div>

      <Link
        href="/polymarket"
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
      >
        Browse all markets →
      </Link>
    </div>
  );
}
