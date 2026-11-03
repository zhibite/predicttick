import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refund Policy | PolyKlines",
  description: "PolyKlines crypto payment and refund policy.",
};

export default function RefundPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-gray-600 dark:text-gray-300">
      <Link href="/" className="text-brand-500">
        ← PolyKlines
      </Link>
      <h1 className="mt-6 mb-2 text-3xl font-semibold text-gray-900 dark:text-white">
        Refund Policy
      </h1>
      <p className="mb-8 text-xs text-gray-500">Last updated: November 2, 2026</p>

      <h2 className="mt-8 text-lg font-semibold text-gray-900 dark:text-white">
        Crypto payments are final
      </h2>
      <p>
        Crypto payments are irreversible. We do not automatically issue refunds
        after an access pass has been activated. If you believe a payment was
        made in error, contact support with the invoice ID and transaction hash
        before using the service.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        Duplicate or incorrect payments
      </h2>
      <p>
        Duplicate payments, overpayments and payments sent for the wrong plan
        may be refunded manually to the original wallet after deducting network
        fees, or converted into account credit at our discretion. Underpayments
        may require a top-up before access is granted.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        Wrong network or token
      </h2>
      <p>
        Sending an unsupported token, or sending on the wrong network, may
        result in permanent loss of funds. We will make reasonable efforts to
        help but cannot guarantee recovery.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
        Service issues
      </h2>
      <p>
        If a paid feature is unavailable for a sustained period due to our
        error, contact support. We may extend the access pass or issue a partial
        credit.
      </p>

      <p className="mt-6">
        Contact: support@polyklines.example
      </p>
    </main>
  );
}
