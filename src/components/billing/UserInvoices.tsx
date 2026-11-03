"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { InvoiceRow } from "@/server/billing";

import PaymentQr from "./PaymentQr";

function formatUtc(epoch: number | null): string {
  if (epoch == null) return "—";
  return (
    new Date(epoch * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC"
  );
}

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

export default function UserInvoices({
  initialInvoices,
}: {
  initialInvoices: InvoiceRow[];
}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [txids, setTxids] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(invoiceId: string) {
    setError(null);
    setBusy(invoiceId);
    try {
      const response = await fetch(
        `/api/billing/invoices/${encodeURIComponent(invoiceId)}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txid: txids[invoiceId] ?? "" }),
        },
      );
      const body = (await response.json()) as {
        invoice?: InvoiceRow;
        error?: { message?: string };
      };
      if (!response.ok || !body.invoice) {
        setError(body.error?.message ?? "Could not submit the payment.");
        return;
      }
      setInvoices((current) =>
        current.map((item) => (item.id === invoiceId ? body.invoice! : item)),
      );
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard may be unavailable; the value remains visible.
    }
  }

  if (invoices.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No invoices yet. Choose a plan on the pricing page to create one.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}
      {invoices.map((invoice) => (
        <article
          key={invoice.id}
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-gray-800 dark:text-white/90">
                {invoice.plan_code} · {invoice.amount_token} {invoice.currency}
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {invoice.network} · created {formatUtc(invoice.created_at)} · expires{" "}
                {formatUtc(invoice.expires_at)}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${statusClass(invoice.status)}`}
            >
              {invoice.status.replace("_", " ")}
            </span>
          </div>

          {invoice.status === "awaiting_payment" && (
            <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.02]">
              <div className="flex flex-col gap-4 sm:flex-row">
                <PaymentQr
                  invoiceId={invoice.id}
                  network={invoice.network}
                  currency={invoice.currency}
                  amount={invoice.amount_token}
                />
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Send exactly{" "}
                    <strong className="text-gray-800 dark:text-white/90">
                      {invoice.amount_token} {invoice.currency}
                    </strong>{" "}
                    on <strong>{invoice.network}</strong> to:
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="break-all rounded bg-white px-2 py-1 text-xs text-gray-700 dark:bg-zinc-900 dark:text-gray-300">
                      {invoice.deposit_address}
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(invoice.deposit_address)}
                      className="text-xs text-brand-500 hover:text-brand-600"
                    >
                      Copy address
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={txids[invoice.id] ?? ""}
                      onChange={(event) =>
                        setTxids((current) => ({
                          ...current,
                          [invoice.id]: event.target.value,
                        }))
                      }
                      placeholder="Paste the transaction hash (txid)"
                      className="h-10 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
                    />
                    <button
                      type="button"
                      disabled={busy === invoice.id}
                      onClick={() => submit(invoice.id)}
                      className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                      {busy === invoice.id ? "Submitting..." : "I have paid"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {invoice.status === "submitted" && (
            <p className="mt-4 text-sm text-warning-700 dark:text-warning-400">
              Payment under review. We review payments within 12 hours.
            </p>
          )}

          {invoice.txid && (
            <p className="mt-3 break-all text-xs text-gray-500 dark:text-gray-400">
              txid: {invoice.txid}
            </p>
          )}
          {invoice.review_note && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Review note: {invoice.review_note}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
