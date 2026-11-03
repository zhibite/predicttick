import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | PolyKlines",
  description: "How PolyKlines handles account and usage data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-gray-600 dark:text-gray-300">
      <Link href="/" className="text-brand-500">
        ← PolyKlines
      </Link>
      <h1 className="mt-6 mb-2 text-3xl font-semibold text-gray-900 dark:text-white">
        Privacy Policy
      </h1>
      <p className="mb-8 text-xs text-gray-500">Last updated: November 2, 2026</p>

      <h2 className="mt-8 text-lg font-semibold text-gray-900 dark:text-white">
        Data we collect
      </h2>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        <li>Account data: email address, display name and hashed password.</li>
        <li>
          Payment data: plan, invoice amount, network, transaction hash and
          public wallet address. We do not store private keys or card data.
        </li>
        <li>
          Usage data: API requests, export volume, backtest runs and
          authentication events.
        </li>
        <li>
          Technical data: IP address and logs needed for security, rate limiting
          and troubleshooting.
        </li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        How we use it
      </h2>
      <p>
        We use this data to provide accounts, grant access passes, review crypto
        payments, enforce quotas, prevent abuse and improve the service. We do
        not sell personal data.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        Cookies
      </h2>
      <p>
        We use a single essential session cookie to keep you signed in. It is
        HTTP-only and is not used for advertising.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        Retention
      </h2>
      <p>
        Account and payment records are kept while your account is active and
        for a reasonable period afterwards for accounting and dispute
        resolution. Usage logs are retained for a limited period.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        Your rights
      </h2>
      <p>
        You may request access to, correction of, or deletion of your personal
        data by contacting support@polyklines.example. Some records may be
        retained where required by law.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        Third parties
      </h2>
      <p>
        We use infrastructure, email and blockchain-explorer services to operate
        the product. Public blockchain transactions are inherently public and
        may be visible to anyone.
      </p>
    </main>
  );
}
