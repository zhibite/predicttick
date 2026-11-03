import type { Metadata } from "next";
import Link from "next/link";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { getCurrentUser } from "@/server/auth";
import {
  getPaymentWallets,
  getPlans,
  parseFeatures,
  paymentsEnabled,
} from "@/server/billing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing | PolyKlines",
  description:
    "PolyKlines plans for market history, backtesting, CSV exports and API access.",
};

const ORDER = ["free", "basic_30", "basic_365", "pro_30", "pro_365"];

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function planFor(
  plans: Awaited<ReturnType<typeof getPlans>>,
  code: string,
) {
  return plans.find((plan) => plan.code === code);
}

export default async function PricingPage() {
  const user = await getCurrentUser();
  const plans = getPlans().sort(
    (a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code),
  );
  const basicMonthly = planFor(plans, "basic_30");
  const basicAnnual = planFor(plans, "basic_365");
  const proMonthly = planFor(plans, "pro_30");
  const proAnnual = planFor(plans, "pro_365");
  const free = planFor(plans, "free");
  const wallets = getPaymentWallets();
  const canPay =
    paymentsEnabled() &&
    wallets.some(
      (wallet) =>
        wallet.active === 1 &&
        wallet.deposit_address &&
        wallet.token_contract &&
        wallet.token_decimals > 0,
    );

  const ctaHref = user
    ? "/account/billing"
    : "/signup?next=/account/billing";

  return (
    <div>
      <PageBreadcrumb pageTitle="Pricing" />
      <p className="mb-8 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Browse recent markets for free. Paid plans unlock longer history,
        custom strategy backtests, CSV exports and the external API. Payments
        are accepted in USDT or USDC on low-fee networks and reviewed manually
        within 12 hours.
      </p>

      {!canPay && (
        <div className="mb-6 rounded-2xl border border-warning-200 bg-warning-50 px-5 py-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          Crypto payments are not available yet. Pricing is shown for planning;
          the payment networks have not been configured.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Free
          </p>
          <h2 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">
            Explore
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Anonymous visitors see the last 7 days. Registered accounts see the
            last 30 days and can try a few built-in backtests.
          </p>
          <p className="mt-5 text-3xl font-semibold text-gray-800 dark:text-white/90">
            $0
          </p>
          <ul className="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            {(parseFeatures(free?.features_json ?? "{}").features ?? []).map(
              (feature) => (
                <li key={feature} className="flex gap-2">
                  <span className="text-success-500">✓</span>
                  {feature}
                </li>
              ),
            )}
          </ul>
          <Link
            href={user ? "/markets" : "/signup"}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {user ? "Browse markets" : "Create free account"}
          </Link>
        </section>

        {[
          { key: "basic", monthly: basicMonthly, annual: basicAnnual },
          { key: "pro", monthly: proMonthly, annual: proAnnual },
        ].map(({ key, monthly, annual }) => {
          if (!monthly || !annual) return null;
          const features = parseFeatures(monthly.features_json).features ?? [];
          const isPro = key === "pro";
          return (
            <section
              key={key}
              className={`rounded-2xl border bg-white p-6 dark:bg-white/[0.03] ${
                isPro
                  ? "border-brand-300 shadow-theme-md dark:border-brand-500/40"
                  : "border-gray-200 dark:border-gray-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {isPro ? "Pro" : "Basic"}
                </p>
                {isPro && (
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                    Best for research
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                {isPro ? "Full research" : "Core access"}
              </h2>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-3xl font-semibold text-gray-800 dark:text-white/90">
                  {formatUsd(monthly.price_usd_cents)}
                </span>
                <span className="pb-1 text-sm text-gray-500 dark:text-gray-400">
                  / 30 days
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                or{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {formatUsd(annual.price_usd_cents)}
                </span>{" "}
                / 365 days (20% off)
              </p>
              <ul className="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                {features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="text-success-500">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={ctaHref}
                className={`mt-6 inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-medium ${
                  isPro
                    ? "bg-brand-500 text-white hover:bg-brand-600"
                    : "border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                {user ? "Choose plan" : "Create account to subscribe"}
              </Link>
            </section>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
          Payment details
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Networks: Tron (TRC20 USDT), Base (USDC), Polygon (USDT or USDC).</li>
          <li>Send the exact amount shown on the invoice, then submit the transaction hash.</li>
          <li>Manual review is completed within 12 hours. Access is granted after approval.</li>
          <li>Plans are prepaid; they do not renew automatically. Renew any time and the new period is added to your current expiry date.</li>
        </ul>
        <p className="mt-4 text-xs text-gray-400">
          <Link href="/terms" className="hover:text-brand-500">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="hover:text-brand-500">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/refund" className="hover:text-brand-500">
            Refund policy
          </Link>
        </p>
      </div>
    </div>
  );
}
