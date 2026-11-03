"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { InvoiceRow } from "@/server/billing";

function formatUtc(epoch: number | null): string {
  if (epoch == null) return "—";
  return (
    new Date(epoch * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC"
  );
}

const EXPLORERS: Record<string, string> = {
  tron: "https://tronscan.org/#/transaction/",
  base: "https://basescan.org/tx/",
  polygon: "https://polygonscan.com/tx/",
};

function statusClass(status: string): string {
  switch (status) {
    case "approved":
      return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
    case "rejected":
    case "expired":
      return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
    case "submitted":
      return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";
  }
}

const STATUS_ORDER = ["submitted", "awaiting_payment", "approved", "rejected", "expired"];

export default function PaymentReview({
  initialInvoices,
  paymentsEnabled,
}: {
  initialInvoices: InvoiceRow[];
  paymentsEnabled: boolean;
}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...invoices].sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
          b.created_at - a.created_at,
      ),
    [invoices],
  );

  async function act(invoice: InvoiceRow, action: "approve" | "reject") {
    const promptText =
      action === "approve"
        ? "Optional approval note (leave empty for none):"
        : "Reason for rejection (optional):";
    const note = window.prompt(promptText, "");
    if (note === null) return;

    setError(null);
    setBusy(`${invoice.id}:${action}`);
    try {
      const response = await fetch(
        `/api/admin/payments/${encodeURIComponent(invoice.id)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        },
      );
      const body = (await response.json()) as {
        invoice?: InvoiceRow;
        error?: { message?: string };
      };
      if (!response.ok || !body.invoice) {
        setError(body.error?.message ?? "Could not update the invoice.");
        return;
      }
      setInvoices((current) =>
        current.map((item) => (item.id === invoice.id ? body.invoice! : item)),
      );
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {!paymentsEnabled && (
        <div className="rounded-2xl border border-warning-200 bg-warning-50 px-5 py-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          Payments are disabled. Set <code>POLY_PAYMENTS_ENABLED=1</code> after
          configuring wallets in{" "}
          <Link href="/admin/settings/payments" className="underline">
            Payment settings
          </Link>
          .
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          No invoices yet. Invoices appear here after users start a crypto
          payment.
        </div>
      ) : (
        sorted.map((invoice) => {
          const explorer = EXPLORERS[invoice.network];
          return (
            <article
              key={invoice.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {invoice.user_email ?? invoice.user_id} · {invoice.plan_code}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {invoice.amount_token} {invoice.currency} on{" "}
                    {invoice.network} · created {formatUtc(invoice.created_at)} ·
                    expires {formatUtc(invoice.expires_at)}
                  </p>
                  <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
                    {invoice.id}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${statusClass(invoice.status)}`}
                >
                  {invoice.status.replace("_", " ")}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-gray-400">Deposit address</dt>
                  <dd className="mt-1 break-all font-mono text-gray-700 dark:text-gray-300">
                    {invoice.deposit_address || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Token contract</dt>
                  <dd className="mt-1 break-all font-mono text-gray-700 dark:text-gray-300">
                    {invoice.token_contract || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Submitted</dt>
                  <dd className="mt-1 text-gray-700 dark:text-gray-300">
                    {formatUtc(invoice.submitted_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Review SLA</dt>
                  <dd className="mt-1 text-gray-700 dark:text-gray-300">
                    Within 12 hours
                  </dd>
                </div>
              </dl>

              {invoice.txid && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="break-all font-mono text-gray-600 dark:text-gray-300">
                    txid: {invoice.txid}
                  </span>
                  {explorer && (
                    <a
                      href={`${explorer}${invoice.txid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-500 hover:text-brand-600"
                    >
                      Open explorer
                    </a>
                  )}
                </div>
              )}

              {invoice.review_note && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Review note: {invoice.review_note}
                </p>
              )}

              {invoice.status === "submitted" && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy === `${invoice.id}:approve`}
                    onClick={() => act(invoice, "approve")}
                    className="rounded-lg bg-success-500 px-4 py-2 text-sm font-medium text-white hover:bg-success-600 disabled:opacity-50"
                  >
                    {busy === `${invoice.id}:approve`
                      ? "Approving..."
                      : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === `${invoice.id}:reject`}
                    onClick={() => act(invoice, "reject")}
                    className="rounded-lg border border-error-300 px-4 py-2 text-sm font-medium text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-error-500/40 dark:text-error-400 dark:hover:bg-error-500/10"
                  >
                    {busy === `${invoice.id}:reject` ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
