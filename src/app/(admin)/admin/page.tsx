import type { Metadata } from "next";
import Link from "next/link";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";

export const metadata: Metadata = {
  title: "Admin | PolyKlines",
  description: "PolyKlines administration.",
};

const links = [
  {
    href: "/admin/leaderboard",
    title: "Leaderboard addresses",
    description:
      "Add or hide manually collected Polymarket wallets and refresh their cached trading data.",
  },
  {
    href: "/admin/paper",
    title: "Paper trading",
    description:
      "Run admin-only simulated strategies against live Up/Down books, with full trade, position and settlement history.",
  },
  {
    href: "/admin/payments",
    title: "Payment review",
    description:
      "Review submitted USDT/USDC invoices, approve access passes and handle exceptions.",
  },
  {
    href: "/admin/settings/payments",
    title: "Payment settings",
    description:
      "Configure receiving addresses, token contracts and enable payment networks.",
  },
  {
    href: "/admin/system",
    title: "System status",
    description:
      "Collector and jobs heartbeats, queues, disk usage, database sizes and recent failures.",
  },
];

export default function AdminPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Admin" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-gray-200 bg-white p-6 transition hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40"
          >
            <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
              {link.title}
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {link.description}
            </p>
          </Link>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        <p>
          Payment receiving addresses and token contracts are intentionally left
          empty. Fill them in Payment settings when you are ready to accept
          crypto payments, then set <code>POLY_PAYMENTS_ENABLED=1</code> and
          restart the server.
        </p>
      </div>
    </div>
  );
}
