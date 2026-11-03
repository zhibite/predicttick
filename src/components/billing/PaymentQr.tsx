"use client";

import { useEffect, useState } from "react";

interface QrResponse {
  qrDataUrl?: string;
  uri?: string;
  mode?: "evm" | "tron";
  error?: { message?: string };
}

const NETWORK_LABEL: Record<string, string> = {
  tron: "Tron (TRC20)",
  base: "Base",
  polygon: "Polygon",
};

export default function PaymentQr({
  invoiceId,
  network,
  currency,
  amount,
}: {
  invoiceId: string;
  network: string;
  currency: string;
  amount: string;
}) {
  const [data, setData] = useState<QrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/billing/invoices/${encodeURIComponent(invoiceId)}/qr`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as QrResponse;
        if (!response.ok || !body.qrDataUrl) {
          setError(body.error?.message ?? "Could not load the payment QR code.");
          return;
        }
        setData(body);
      })
      .catch((requestError: Error) => {
        if (requestError.name !== "AbortError") {
          setError("Could not load the payment QR code.");
        }
      });
    return () => controller.abort();
  }, [invoiceId]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-3 dark:bg-zinc-900">
      {error ? (
        <p className="text-xs text-error-600 dark:text-error-400">{error}</p>
      ) : data?.qrDataUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.qrDataUrl}
            alt={`${currency} payment QR code on ${NETWORK_LABEL[network] ?? network}`}
            width={180}
            height={180}
            className="h-[180px] w-[180px]"
          />
          <p className="text-center text-[11px] text-gray-500 dark:text-gray-400">
            {amount} {currency} · {NETWORK_LABEL[network] ?? network}
          </p>
          {data.mode === "evm" && data.uri && (
            <a
              href={data.uri}
              className="text-[11px] text-brand-500 hover:text-brand-600"
            >
              Open in wallet
            </a>
          )}
        </>
      ) : (
        <div className="flex h-[180px] w-[180px] items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-400 dark:bg-white/5">
          Loading QR…
        </div>
      )}
      <p className="max-w-[220px] text-center text-[10px] leading-4 text-warning-700 dark:text-warning-400">
        Send only {currency} on {NETWORK_LABEL[network] ?? network}. Wrong
        network or token may be lost.
      </p>
    </div>
  );
}
