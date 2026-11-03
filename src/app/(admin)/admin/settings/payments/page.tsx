import type { Metadata } from "next";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PaymentSettings from "@/components/admin/PaymentSettings";
import { requireAdmin } from "@/server/auth";
import {
  EXPECTED_WALLETS,
  getPaymentWallets,
  paymentsEnabled,
} from "@/server/billing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment settings | PolyKlines Admin",
  description: "Configure crypto receiving wallets and token contracts.",
};

export default async function AdminPaymentSettingsPage() {
  await requireAdmin();
  return (
    <div>
      <PageBreadcrumb pageTitle="Payment settings" />
      <p className="mb-6 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Receiving addresses and token contracts are intentionally empty until
        you provide them. Enabling a network requires a valid address, token
        contract and decimals. Keep private keys offline: this application only
        stores watch-only addresses.
      </p>
      <PaymentSettings
        initialWallets={getPaymentWallets()}
        expected={EXPECTED_WALLETS}
        paymentsEnabled={paymentsEnabled()}
      />
    </div>
  );
}
