import type { Metadata } from "next";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PaymentReview from "@/components/admin/PaymentReview";
import { requireAdmin } from "@/server/auth";
import { listInvoicesForAdmin, paymentsEnabled } from "@/server/billing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment review | PolyKlines Admin",
  description: "Review crypto payment invoices and approve access passes.",
};

export default async function AdminPaymentsPage() {
  await requireAdmin();
  return (
    <div>
      <PageBreadcrumb pageTitle="Payment review" />
      <p className="mb-6 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Verify the transaction hash, receiving address, token contract, amount
        and confirmations on the block explorer before approving. Approval
        extends the user&apos;s access pass exactly once.
      </p>
      <PaymentReview
        initialInvoices={listInvoicesForAdmin()}
        paymentsEnabled={paymentsEnabled()}
      />
    </div>
  );
}
