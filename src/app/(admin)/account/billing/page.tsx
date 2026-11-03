import type { Metadata } from "next";
import Link from "next/link";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CreateInvoiceForm from "@/components/billing/CreateInvoiceForm";
import UserInvoices from "@/components/billing/UserInvoices";
import { requireUser } from "@/server/auth";
import {
  EXPECTED_WALLETS,
  getPaymentWallets,
  getPlan,
  getPlans,
  listUserInvoices,
  paymentsEnabled,
} from "@/server/billing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Billing | PolyKlines",
  description: "Manage your PolyKlines access pass and payments.",
};

function formatDate(epochSeconds: number | null): string {
  if (epochSeconds == null) return "—";
  return (
    new Date(epochSeconds * 1000).toISOString().replace("T", " ").slice(0, 16) +
    " UTC"
  );
}

export default async function BillingPage() {
  const user = await requireUser();
  const invoices = listUserInvoices(user.id);
  const plan = user.access.planCode ? getPlan(user.access.planCode) : null;
  const planOrder = ["basic_30", "basic_365", "pro_30", "pro_365"];
  const paidPlans = getPlans()
    .filter((item) => item.price_usd_cents > 0)
    .sort((a, b) => planOrder.indexOf(a.code) - planOrder.indexOf(b.code));
  const buyableWallets = getPaymentWallets()
    .filter(
      (wallet) =>
        wallet.active === 1 &&
        wallet.deposit_address &&
        wallet.token_contract &&
        wallet.token_decimals > 0,
    )
    .map((wallet) => ({
      network: wallet.network,
      currency: wallet.currency,
      label:
        EXPECTED_WALLETS.find(
          (spec) =>
            spec.network === wallet.network &&
            spec.currency === wallet.currency,
        )?.label ?? `${wallet.network} - ${wallet.currency}`,
    }));

  return (
    <div>
      <PageBreadcrumb pageTitle="Billing" />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Current plan</p>
          <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            {user.access.isPaid ? plan?.name ?? user.access.planCode : "Free"}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Access until</p>
          <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            {formatDate(user.access.accessUntil)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs text-gray-500 dark:text-gray-400">Payment status</p>
          <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            {paymentsEnabled() ? "Crypto invoices" : "Not configured"}
          </p>
        </div>
      </div>

      {!paymentsEnabled() && (
        <div className="mb-6 rounded-2xl border border-warning-200 bg-warning-50 px-5 py-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          Crypto payments are not available yet. The administrator has not
          configured a receiving wallet. You can keep using the free tier in
          the meantime.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
            Invoices
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Prepaid access passes. Renewals are added to the current expiry.
          </p>
        </div>
        <Link
          href="/pricing"
          className="inline-flex rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          {user.access.isPaid ? "Extend access" : "Upgrade"}
        </Link>
      </div>

      <CreateInvoiceForm
        plans={paidPlans}
        wallets={buyableWallets}
        paymentsEnabled={paymentsEnabled()}
      />

      <UserInvoices
        key={invoices.map((invoice) => invoice.id).join(",")}
        initialInvoices={invoices}
      />
    </div>
  );
}
