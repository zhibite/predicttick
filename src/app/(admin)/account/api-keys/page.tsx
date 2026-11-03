import type { Metadata } from "next";
import Link from "next/link";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ApiKeysManager from "@/components/api/ApiKeysManager";
import { listApiKeys } from "@/server/api-keys";
import { requireUser } from "@/server/auth";
import { getEntitlements } from "@/server/entitlements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "API keys | PolyKlines",
  description: "Create and revoke PolyKlines API keys.",
};

export default async function ApiKeysPage() {
  const user = await requireUser();
  const entitlements = getEntitlements(user);

  return (
    <div>
      <PageBreadcrumb pageTitle="API keys" />
      <p className="mb-6 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        API keys inherit your current plan limits. The full key is shown once
        when created; store it securely. Revoke a key immediately if it leaks.
      </p>
      {entitlements.apiKeys <= 0 ? (
        <div className="mb-6 rounded-2xl border border-warning-200 bg-warning-50 px-5 py-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          API access is not included in your current plan.{" "}
          <Link href="/pricing" className="underline">
            View plans
          </Link>
          .
        </div>
      ) : null}
      <ApiKeysManager
        initialKeys={listApiKeys(user.id)}
        limit={entitlements.apiKeys}
        ratePerMinute={entitlements.apiRatePerMinute}
        requestsPerDay={entitlements.apiRequestsPerDay}
      />
    </div>
  );
}
