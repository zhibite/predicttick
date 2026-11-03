"use client";

import { useState } from "react";

import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import type {
  PaymentWalletRow,
  WalletSpec,
} from "@/server/billing";

interface Draft {
  network: string;
  currency: string;
  label: string;
  tokenContract: string;
  tokenDecimals: string;
  depositAddress: string;
  explorerBase: string;
  active: boolean;
  saving?: boolean;
  message?: string;
  error?: string;
}

function buildDrafts(
  expected: WalletSpec[],
  wallets: PaymentWalletRow[],
): Draft[] {
  return expected.map((spec) => {
    const wallet = wallets.find(
      (item) =>
        item.network === spec.network && item.currency === spec.currency,
    );
    return {
      network: spec.network,
      currency: spec.currency,
      label: spec.label,
      tokenContract: wallet?.token_contract ?? "",
      tokenDecimals: String(wallet?.token_decimals ?? 6),
      depositAddress: wallet?.deposit_address ?? "",
      explorerBase: wallet?.explorer_base ?? spec.explorerBase,
      active: wallet?.active === 1,
    };
  });
}

export default function PaymentSettings({
  initialWallets,
  expected,
  paymentsEnabled,
}: {
  initialWallets: PaymentWalletRow[];
  expected: WalletSpec[];
  paymentsEnabled: boolean;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    buildDrafts(expected, initialWallets),
  );

  function update(index: number, patch: Partial<Draft>) {
    setDrafts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  async function save(index: number) {
    const draft = drafts[index];
    update(index, { saving: true, message: undefined, error: undefined });
    try {
      const response = await fetch("/api/admin/payment-wallets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: draft.network,
          currency: draft.currency,
          tokenContract: draft.tokenContract,
          tokenDecimals: Number(draft.tokenDecimals),
          depositAddress: draft.depositAddress,
          explorerBase: draft.explorerBase,
          active: draft.active,
        }),
      });
      const body = (await response.json()) as {
        wallet?: PaymentWalletRow;
        error?: { message?: string };
      };
      if (!response.ok || !body.wallet) {
        update(index, {
          saving: false,
          error: body.error?.message ?? "Could not save this wallet.",
        });
        return;
      }
      update(index, {
        saving: false,
        active: body.wallet.active === 1,
        tokenContract: body.wallet.token_contract,
        tokenDecimals: String(body.wallet.token_decimals),
        depositAddress: body.wallet.deposit_address,
        explorerBase: body.wallet.explorer_base,
        message: body.wallet.active
          ? "Saved and enabled. Set POLY_PAYMENTS_ENABLED=1 to expose checkout."
          : "Saved. This network is disabled.",
      });
    } catch {
      update(index, { saving: false, error: "Network error. Try again." });
    }
  }

  return (
    <div className="space-y-4">
      {!paymentsEnabled && (
        <div className="rounded-2xl border border-warning-200 bg-warning-50 px-5 py-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          Global payments are disabled (`POLY_PAYMENTS_ENABLED=0`). You can
          configure wallets now, but checkout stays hidden until the flag is
          set to 1 and the server is restarted.
        </div>
      )}

      {drafts.map((draft, index) => {
        const configured =
          draft.depositAddress &&
          draft.tokenContract &&
          Number(draft.tokenDecimals) > 0;
        return (
          <section
            key={`${draft.network}:${draft.currency}`}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {draft.label}
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {configured ? "Configured" : "Not configured"} ·{" "}
                  {draft.active ? "Enabled" : "Disabled"}
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) =>
                    update(index, { active: event.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600"
                />
                Active
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <Label>Watch-only deposit address</Label>
                <Input
                  type="text"
                  placeholder={
                    draft.network === "tron"
                      ? "T... (Tron address)"
                      : "0x... (EVM address)"
                  }
                  value={draft.depositAddress}
                  onChange={(event) =>
                    update(index, { depositAddress: event.target.value })
                  }
                  disabled={draft.saving}
                />
              </div>
              <div>
                <Label>Token contract</Label>
                <Input
                  type="text"
                  placeholder={
                    draft.network === "tron" ? "TRC20 contract" : "0x... contract"
                  }
                  value={draft.tokenContract}
                  onChange={(event) =>
                    update(index, { tokenContract: event.target.value })
                  }
                  disabled={draft.saving}
                />
              </div>
              <div>
                <Label>Token decimals</Label>
                <Input
                  type="number"
                  min="0"
                  max="18"
                  step={1}
                  value={draft.tokenDecimals}
                  onChange={(event) =>
                    update(index, { tokenDecimals: event.target.value })
                  }
                  disabled={draft.saving}
                />
              </div>
              <div className="lg:col-span-2">
                <Label>Explorer transaction URL prefix</Label>
                <Input
                  type="text"
                  value={draft.explorerBase}
                  onChange={(event) =>
                    update(index, { explorerBase: event.target.value })
                  }
                  disabled={draft.saving}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => save(index)}
                disabled={draft.saving}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {draft.saving ? "Saving..." : "Save"}
              </button>
              {draft.message && (
                <span className="text-xs text-success-600 dark:text-success-400">
                  {draft.message}
                </span>
              )}
              {draft.error && (
                <span className="text-xs text-error-600 dark:text-error-400">
                  {draft.error}
                </span>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
