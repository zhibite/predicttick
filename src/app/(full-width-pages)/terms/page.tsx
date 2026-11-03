import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | PolyKlines",
  description: "PolyKlines terms of service.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-gray-600 dark:text-gray-300">
      <Link href="/" className="text-brand-500">
        ← PolyKlines
      </Link>
      <h1 className="mt-6 mb-2 text-3xl font-semibold text-gray-900 dark:text-white">
        Terms of Service
      </h1>
      <p className="mb-8 text-xs text-gray-500">Last updated: November 2, 2026</p>

      <h2 className="mt-8 text-lg font-semibold text-gray-900 dark:text-white">
        1. Service
      </h2>
      <p>
        PolyKlines provides Polymarket Up/Down market data, charting,
        backtesting tools and API access. Market data is collected from public
        Polymarket interfaces and is provided for research and informational
        purposes only.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        2. Accounts
      </h2>
      <p>
        You are responsible for your account credentials and for activity under
        your account. You must provide a valid email address and keep your
        password secure. We may suspend accounts that abuse the service,
        attempt to bypass quotas, or interfere with other users.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        3. Access passes and payments
      </h2>
      <p>
        Paid access is sold as a prepaid access pass for the period shown at
        checkout. Access passes do not renew automatically. Crypto payments are
        reviewed manually and access is granted after approval. You are
        responsible for sending the correct asset on the correct network; funds
        sent to the wrong address or network may be unrecoverable.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        4. API and data use
      </h2>
      <p>
        API keys are personal and may not be shared or resold. You may not use
        the service to scrape, redistribute or resell data in violation of
        applicable law or the terms of the upstream data provider. Rate limits
        and quotas apply.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        5. No investment advice
      </h2>
      <p>
        Charts, historical data and backtest results are not investment advice.
        Past performance does not guarantee future results. You are solely
        responsible for your trading decisions.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        6. Availability and liability
      </h2>
      <p>
        The service is provided on an “as is” and “as available” basis. To the
        maximum extent permitted by law, PolyKlines is not liable for indirect,
        incidental or consequential damages, or for losses arising from data
        gaps, outages or trading decisions.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        7. Changes and contact
      </h2>
      <p>
        We may update these terms and will post the revised version on this
        page. Questions: support@polyklines.example.
      </p>
    </main>
  );
}
