"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { PlanRow } from "@/server/billing";

export interface BuyableWallet {
  network: string;
  currency: string;
  label: string;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export default function CreateInvoiceForm({
  plans,
  wallets,
  paymentsEnabled,
}: {
  plans: PlanRow[];
  wallets: BuyableWallet[];
  paymentsEnabled: boolean;
}) {
  const router = useRouter();
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? "");
  const [walletKey, setWalletKey] = useState(
    wallets[0] ? `${wallets[0].network}:${wallets[0].currency}` : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.code === planCode),
    [plans, planCode],
  );

  if (!paymentsEnabled || wallets.length === 0 || plans.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Checkout is not available yet. Payment wallets must be configured by an
        administrator before invoices can be created.
      </div>
    );
  }

  async function createInvoice() {
    setError(null);
    setMessage(null);
    const [network, currency] = walletKey.split(":");
    if (!planCode || !network || !currency) {
      setError("Choose a plan and a payment network.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode, network, currency }),
      });
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(body.error?.message ?? "Could not create the invoice.");
        return;
      }
      setMessage(
        "Invoice created. Follow the payment instructions in the invoice below.",
      );
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
        Buy or extend access
      </h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Prepaid access pass. No automatic renewal. Renewals are added to your
        current expiry date.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="text-xs text-gray-500 dark:text-gray-400">
          Plan
          <select
            value={planCode}
            onChange={(event) => setPlanCode(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
          >
            {plans.map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.name} — {formatUsd(plan.price_usd_cents)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500 dark:text-gray-400">
          Pay with
          <select
            value={walletKey}
            onChange={(event) => setWalletKey(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-zinc-900 dark:text-white/90"
          >
            {wallets.map((wallet) => (
              <option
                key={`${wallet.network}:${wallet.currency}`}
                value={`${wallet.network}:${wallet.currency}`}
              >
                {wallet.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={createInvoice}
            disabled={loading}
            className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create invoice"}
          </button>
        </div>
      </div>
      {selectedPlan && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Selected: {selectedPlan.name} · {formatUsd(selectedPlan.price_usd_cents)}{" "}
          · {selectedPlan.duration_days} days
        </p>
      )}
      {message && (
        <p className="mt-3 text-xs text-success-600 dark:text-success-400">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 text-xs text-error-600 dark:text-error-400">
          {error}
        </p>
      )}
    </div>
  );
}
