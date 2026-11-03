import QRCode from "qrcode";

import type { InvoiceRow } from "@/server/billing";

function toBaseUnits(amount: string, decimals: number): string {
  const [wholePart, fractionPart = ""] = amount.split(".");
  const whole = (wholePart || "0").replace(/^0+(?=\d)/, "");
  if (decimals <= 0) return whole;
  const fraction = `${fractionPart}${"0".repeat(decimals)}`.slice(0, decimals);
  const units = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  return units || "0";
}

export function buildPaymentUri(invoice: InvoiceRow): {
  uri: string;
  mode: "evm" | "tron";
  displayAddress: string;
} {
  const address = invoice.deposit_address;
  if (invoice.network === "tron") {
    // Tron wallets reliably accept a plain address QR; the amount/token are
    // shown as text next to the code.
    return { uri: address, mode: "tron", displayAddress: address };
  }

  if (!invoice.chain_id || !invoice.token_contract) {
    return { uri: address, mode: "evm", displayAddress: address };
  }

  const units = toBaseUnits(invoice.amount_token, invoice.token_decimals);
  const uri =
    `ethereum:${invoice.token_contract}@${invoice.chain_id}/transfer` +
    `?address=${address}&uint256=${units}`;
  return { uri, mode: "evm", displayAddress: address };
}

export async function paymentQr(invoice: InvoiceRow): Promise<{
  uri: string;
  mode: "evm" | "tron";
  qrDataUrl: string;
}> {
  const payment = buildPaymentUri(invoice);
  const qrDataUrl = await QRCode.toDataURL(payment.uri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#111111", light: "#ffffff" },
  });
  return {
    uri: payment.uri,
    mode: payment.mode,
    qrDataUrl,
  };
}
