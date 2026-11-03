import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "API docs | PolyKlines",
  description: "PolyKlines historical market data API documentation.",
};

const endpoints = [
  ["GET", "/api/v1/health", "Health check (no key)"],
  ["GET", "/api/v1/meta", "Public asset and coverage summary (no key)"],
  ["GET", "/api/v1/me", "Current key, plan, limits and usage"],
  ["GET", "/api/v1/markets", "Paginated market windows"],
  ["GET", "/api/v1/markets/{slug}", "Market detail"],
  ["GET", "/api/v1/markets/{slug}/samples", "Paginated samples"],
  ["GET", "/api/v1/candles", "Cross-window OHLC candles"],
  ["GET", "/api/v1/coverage", "Daily coverage"],
  ["GET", "/api/v1/export", "Stream a CSV export"],
  ["GET/POST", "/api/v1/exports", "List or create background exports"],
  ["GET", "/api/v1/exports/{id}", "Export job status"],
  ["GET", "/api/v1/exports/{id}/file", "Download an export file"],
  ["GET", "/api/v1/openapi.json", "OpenAPI 3.1 specification"],
];

export default function ApiDocsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 text-sm leading-7 text-gray-600 dark:text-gray-300">
      <Link href="/" className="text-brand-500">
        ← PolyKlines
      </Link>
      <h1 className="mt-6 mb-2 text-3xl font-semibold text-gray-900 dark:text-white">
        PolyKlines API
      </h1>
      <p className="mb-8 text-gray-500 dark:text-gray-400">
        Historical Polymarket Up/Down market data. Create an API key in{" "}
        <Link href="/account/api-keys" className="text-brand-500">
          your account
        </Link>{" "}
        and an active access pass is required.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-gray-900 dark:text-white">
        Authentication
      </h2>
      <pre className="mt-2 overflow-x-auto rounded-xl bg-gray-900 p-4 text-xs text-gray-100">
{`curl -H "Authorization: Bearer pk_live_..." \\
  "https://your-domain/api/v1/markets?asset=btc&period=5m&from=2026-10-01&to=2026-10-07"`}
      </pre>
      <p className="mt-2">
        You can also send <code>X-API-Key: pk_live_...</code>. Keys inherit the
        current plan limits and can be revoked at any time.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-gray-900 dark:text-white">
        Endpoints
      </h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
              <th className="py-2 pr-4">Method</th>
              <th className="py-2 pr-4">Path</th>
              <th className="py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map(([method, path, description]) => (
              <tr
                key={path}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className="py-2 pr-4 font-mono text-brand-500">{method}</td>
                <td className="py-2 pr-4 font-mono">{path}</td>
                <td className="py-2">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-gray-900 dark:text-white">
        Pagination
      </h2>
      <p>
        List endpoints return a <code>pagination.nextCursor</code>. Pass it back
        as <code>cursor</code> to fetch the next page. Cursors are opaque.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-gray-900 dark:text-white">
        Limits and errors
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Basic: 1 key, 60 requests/min, 10,000 requests/day, 5 GB export/day.</li>
        <li>Pro: 5 keys, 300 requests/min, 100,000 requests/day, 50 GB export/day.</li>
        <li>History: Basic 365 days, Pro 730 days.</li>
        <li>
          Errors use <code>{`{ "error": { "code", "message", "requestId" } }`}</code>.
        </li>
        <li>401 invalid key · 402 inactive pass · 403 plan/scope · 429 rate/quota.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-gray-900 dark:text-white">
        Examples
      </h2>
      <pre className="mt-2 overflow-x-auto rounded-xl bg-gray-900 p-4 text-xs text-gray-100">
{`# Markets
curl -H "Authorization: Bearer $POLY_API_KEY" \\
  "https://your-domain/api/v1/markets?asset=btc&period=5m&limit=100"

# Samples
curl -H "Authorization: Bearer $POLY_API_KEY" \\
  "https://your-domain/api/v1/markets/btc-updown-5m-1793448000/samples?limit=500"

# Candles (31-day cap per request)
curl -H "Authorization: Bearer $POLY_API_KEY" \\
  "https://your-domain/api/v1/candles?asset=btc&period=5m&interval=1m&from=2026-10-01&to=2026-10-07"

# CSV export
curl -L -H "Authorization: Bearer $POLY_API_KEY" \\
  "https://your-domain/api/v1/export?asset=btc&period=5m&from=2026-10-01&to=2026-10-07" -o btc.csv`}
      </pre>

      <p className="mt-8 text-xs text-gray-400">
        OpenAPI:{" "}
        <Link href="/api/v1/openapi.json" className="text-brand-500">
          /api/v1/openapi.json
        </Link>
      </p>
    </main>
  );
}
