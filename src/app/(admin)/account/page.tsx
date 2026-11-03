import type { Metadata } from "next";
import Link from "next/link";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SignOutButton from "@/components/auth/SignOutButton";
import { requireUser } from "@/server/auth";
import { getPlan, parseFeatures } from "@/server/billing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account | PolyKlines",
  description: "Manage your PolyKlines account and access.",
};

function formatDate(epochSeconds: number | null): string {
  if (epochSeconds == null) return "—";
  return new Date(epochSeconds * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function AccountPage() {
  const user = await requireUser();
  const planCode = user.access.isPaid ? user.access.planCode : "free";
  const plan = planCode ? getPlan(planCode) : null;
  const features = plan ? parseFeatures(plan.features_json).features ?? [] : [];

  return (
    <div>
      <PageBreadcrumb pageTitle="Account" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {user.name || user.email}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {user.email}
              </p>
            </div>
            <SignOutButton />
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
              <dt className="text-xs text-gray-500 dark:text-gray-400">Plan</dt>
              <dd className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                {user.access.isPaid ? plan?.name ?? planCode : "Free"}
              </dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
              <dt className="text-xs text-gray-500 dark:text-gray-400">
                Access until
              </dt>
              <dd className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                {formatDate(user.access.accessUntil)}
              </dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
              <dt className="text-xs text-gray-500 dark:text-gray-400">
                Email verified
              </dt>
              <dd className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                {user.emailVerified ? "Yes" : "No"}
              </dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
              <dt className="text-xs text-gray-500 dark:text-gray-400">Role</dt>
              <dd className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                {user.role === "admin" ? "Administrator" : "User"}
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/account/billing"
              className="inline-flex rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              Billing and invoices
            </Link>
            <Link
              href="/account/api-keys"
              className="inline-flex rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              API keys
            </Link>
            <Link
              href="/account/usage"
              className="inline-flex rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              Usage
            </Link>
            <Link
              href="/pricing"
              className="inline-flex rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              View plans
            </Link>
            {user.role === "admin" && (
              <Link
                href="/admin/payments"
                className="inline-flex rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Payment review
              </Link>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
            Current access
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {user.access.isPaid
              ? "Your paid access is active."
              : "You are on the free tier. Upgrade to unlock history, backtests, API and CSV exports."}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            {features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span className="text-success-500">✓</span>
                {feature}
              </li>
            ))}
          </ul>
          {!user.access.isPaid && (
            <Link
              href="/pricing"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white hover:bg-brand-600"
            >
              Upgrade
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
