import { randomBytes, randomUUID } from "node:crypto";

import { getAppDb } from "./app-db";

export interface PlanRow {
  code: string;
  name: string;
  price_usd_cents: number;
  duration_days: number;
  features_json: string;
  active: number;
}

export interface PlanFeatures {
  historyDays?: number;
  backtestsPerDay?: number;
  maxBacktestDays?: number;
  apiKeys?: number;
  apiRequestsPerDay?: number;
  exportBytesPerDay?: number;
  backtestTrialRuns?: number;
  features?: string[];
}

export interface UserAccess {
  planCode: string | null;
  accessUntil: number | null;
  isPaid: boolean;
}

export interface InvoiceRow {
  id: string;
  user_id: string;
  plan_code: string;
  duration_days: number;
  price_usd_cents: number;
  currency: string;
  network: string;
  chain_id: number | null;
  token_contract: string;
  token_decimals: number;
  amount_token: string;
  deposit_address: string;
  status: string;
  txid: string | null;
  payer_address: string | null;
  submitted_at: number | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
  review_note: string | null;
  created_at: number;
  expires_at: number;
  approved_until: number | null;
  user_email?: string;
}

export interface PaymentWalletRow {
  network: string;
  currency: string;
  token_contract: string;
  token_decimals: number;
  deposit_address: string;
  explorer_base: string;
  active: number;
}

export interface WalletSpec {
  network: "tron" | "base" | "polygon";
  currency: "USDT" | "USDC";
  label: string;
  explorerBase: string;
}

export const EXPECTED_WALLETS: WalletSpec[] = [
  {
    network: "tron",
    currency: "USDT",
    label: "Tron (TRC20) - USDT",
    explorerBase: "https://tronscan.org/#/transaction/",
  },
  {
    network: "base",
    currency: "USDC",
    label: "Base - USDC",
    explorerBase: "https://basescan.org/tx/",
  },
  {
    network: "polygon",
    currency: "USDT",
    label: "Polygon - USDT",
    explorerBase: "https://polygonscan.com/tx/",
  },
  {
    network: "polygon",
    currency: "USDC",
    label: "Polygon - USDC",
    explorerBase: "https://polygonscan.com/tx/",
  },
];

export function paymentsEnabled(): boolean {
  return process.env.POLY_PAYMENTS_ENABLED === "1";
}

export function getPlans(): PlanRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT code, name, price_usd_cents, duration_days, features_json, active
       FROM plans WHERE active = 1
       ORDER BY price_usd_cents, duration_days`,
    )
    .all() as unknown as PlanRow[];
  return rows.map((row) => ({ ...row }));
}

export function getPlan(code: string): PlanRow | null {
  const row = getAppDb()
    .prepare(
      `SELECT code, name, price_usd_cents, duration_days, features_json, active
       FROM plans WHERE code = ? AND active = 1`,
    )
    .get(code) as unknown as PlanRow | undefined;
  return row ? { ...row } : null;
}

export function parseFeatures(value: string): PlanFeatures {
  try {
    const parsed = JSON.parse(value) as PlanFeatures;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getUserAccess(userId: string): UserAccess {
  const now = Math.floor(Date.now() / 1000);
  const row = getAppDb()
    .prepare(
      "SELECT plan_code, access_until FROM user_access WHERE user_id = ?",
    )
    .get(userId) as unknown as
    | { plan_code: string | null; access_until: number | null }
    | undefined;
  return {
    planCode: row?.plan_code ?? null,
    accessUntil: row?.access_until ?? null,
    isPaid: row?.access_until != null && row.access_until > now,
  };
}

export function getPaymentWallets(): PaymentWalletRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT network, currency, token_contract, token_decimals,
              deposit_address, explorer_base, active
       FROM payment_wallets ORDER BY network, currency`,
    )
    .all() as unknown as PaymentWalletRow[];
  return rows.map((row) => ({ ...row }));
}

export function getPaymentWallet(
  network: string,
  currency: string,
): PaymentWalletRow | null {
  const row = getAppDb()
    .prepare(
      `SELECT network, currency, token_contract, token_decimals,
              deposit_address, explorer_base, active
       FROM payment_wallets WHERE network = ? AND currency = ?`,
    )
    .get(network, currency) as unknown as PaymentWalletRow | undefined;
  return row ? { ...row } : null;
}

export function upsertPaymentWallet(input: {
  network: string;
  currency: string;
  tokenContract: string;
  tokenDecimals: number;
  depositAddress: string;
  explorerBase: string;
  active: boolean;
}): PaymentWalletRow {
  const db = getAppDb();
  db.prepare(
    `INSERT INTO payment_wallets
       (network, currency, token_contract, token_decimals,
        deposit_address, explorer_base, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(network, currency) DO UPDATE SET
       token_contract = excluded.token_contract,
       token_decimals = excluded.token_decimals,
       deposit_address = excluded.deposit_address,
       explorer_base = excluded.explorer_base,
       active = excluded.active`,
  ).run(
    input.network,
    input.currency,
    input.tokenContract.trim(),
    input.tokenDecimals,
    input.depositAddress.trim(),
    input.explorerBase.trim(),
    input.active ? 1 : 0,
  );

  const wallet = getPaymentWallet(input.network, input.currency);
  if (!wallet) throw new Error("payment wallet was not saved");
  return wallet;
}

export function listUserInvoices(userId: string): InvoiceRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT * FROM crypto_invoices
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
    )
    .all(userId) as unknown as InvoiceRow[];
  return rows.map((row) => ({ ...row }));
}

export function listInvoicesForAdmin(): InvoiceRow[] {
  const rows = getAppDb()
    .prepare(
      `SELECT i.*, u.email AS user_email
       FROM crypto_invoices i
       LEFT JOIN users u ON u.id = i.user_id
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT 200`,
    )
    .all() as unknown as InvoiceRow[];
  return rows.map((row) => ({ ...row }));
}

export function getInvoice(id: string): InvoiceRow | null {
  const row = getAppDb()
    .prepare(
      `SELECT i.*, u.email AS user_email
       FROM crypto_invoices i
       LEFT JOIN users u ON u.id = i.user_id
       WHERE i.id = ?`,
    )
    .get(id) as unknown as InvoiceRow | undefined;
  return row ? { ...row } : null;
}

function centsToTokenAmount(cents: number, decimals: number): string {
  const whole = Math.floor(cents / 100);
  const centsPart = String(cents % 100).padStart(2, "0");
  if (decimals <= 0) return String(whole);
  if (decimals <= 2) return `${whole}.${centsPart.slice(0, decimals)}`;
  return `${whole}.${centsPart}${"0".repeat(decimals - 2)}`;
}

export type InvoiceError =
  | "PAYMENTS_DISABLED"
  | "PLAN_NOT_FOUND"
  | "WALLET_NOT_CONFIGURED"
  | "TOO_MANY_PENDING";

export function createInvoice(
  userId: string,
  planCode: string,
  network: string,
  currency: string,
): { invoice?: InvoiceRow; error?: InvoiceError } {
  if (!paymentsEnabled()) return { error: "PAYMENTS_DISABLED" };
  const plan = getPlan(planCode);
  if (!plan || plan.price_usd_cents <= 0 || plan.duration_days <= 0) {
    return { error: "PLAN_NOT_FOUND" };
  }

  const wallet = getPaymentWallet(network, currency);
  if (
    !wallet ||
    wallet.active !== 1 ||
    !wallet.deposit_address ||
    !wallet.token_contract ||
    wallet.token_decimals <= 0
  ) {
    return { error: "WALLET_NOT_CONFIGURED" };
  }

  const db = getAppDb();
  const pending = db
    .prepare(
      `SELECT COUNT(*) AS n FROM crypto_invoices
       WHERE user_id = ? AND status = 'awaiting_payment' AND expires_at > ?`,
    )
    .get(userId, Math.floor(Date.now() / 1000)) as unknown as { n: number };
  if (pending.n >= 3) return { error: "TOO_MANY_PENDING" };

  const now = Math.floor(Date.now() / 1000);
  const id = `inv_${randomUUID().replace(/-/g, "")}`;
  const amountToken = centsToTokenAmount(plan.price_usd_cents, wallet.token_decimals);
  const chainId = wallet.network === "base" ? 8453 : wallet.network === "polygon" ? 137 : null;

  db.prepare(
    `INSERT INTO crypto_invoices
       (id, user_id, plan_code, duration_days, price_usd_cents,
        currency, network, chain_id, token_contract, token_decimals,
        amount_token, deposit_address, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?)`,
  ).run(
    id,
    userId,
    plan.code,
    plan.duration_days,
    plan.price_usd_cents,
    wallet.currency,
    wallet.network,
    chainId,
    wallet.token_contract,
    wallet.token_decimals,
    amountToken,
    wallet.deposit_address,
    now,
    now + 1_800,
  );

  return { invoice: getInvoice(id) ?? undefined };
}

export type SubmitError =
  | "INVOICE_NOT_FOUND"
  | "INVALID_STATUS"
  | "INVALID_TXID"
  | "EXPIRED"
  | "TXID_USED";

export function submitInvoice(
  userId: string,
  invoiceId: string,
  txidInput: string,
): { invoice?: InvoiceRow; error?: SubmitError } {
  const db = getAppDb();
  const invoice = db
    .prepare("SELECT * FROM crypto_invoices WHERE id = ? AND user_id = ?")
    .get(invoiceId, userId) as unknown as InvoiceRow | undefined;
  if (!invoice) return { error: "INVOICE_NOT_FOUND" };
  if (invoice.status !== "awaiting_payment") return { error: "INVALID_STATUS" };

  const now = Math.floor(Date.now() / 1000);
  if (invoice.expires_at <= now) {
    db.prepare(
      "UPDATE crypto_invoices SET status = 'expired' WHERE id = ? AND status = 'awaiting_payment'",
    ).run(invoiceId);
    return { error: "EXPIRED" };
  }

  const txid = txidInput.trim();
  if (!/^[A-Za-z0-9]{20,128}$/.test(txid)) return { error: "INVALID_TXID" };

  try {
    db.prepare(
      `UPDATE crypto_invoices
       SET status = 'submitted', txid = ?, submitted_at = ?
       WHERE id = ? AND user_id = ? AND status = 'awaiting_payment'`,
    ).run(txid, now, invoiceId, userId);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return { error: "TXID_USED" };
    throw error;
  }

  return { invoice: getInvoice(invoiceId) ?? undefined };
}

export function approveInvoice(
  adminId: string,
  invoiceId: string,
  note?: string,
): { invoice?: InvoiceRow; error?: "INVOICE_NOT_FOUND" | "INVALID_STATUS" } {
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);

  db.exec("BEGIN");
  try {
    const invoice = db
      .prepare("SELECT * FROM crypto_invoices WHERE id = ?")
      .get(invoiceId) as unknown as InvoiceRow | undefined;
    if (!invoice) {
      db.exec("ROLLBACK");
      return { error: "INVOICE_NOT_FOUND" };
    }
    if (invoice.status !== "submitted") {
      db.exec("ROLLBACK");
      return { error: "INVALID_STATUS" };
    }

    const current = db
      .prepare("SELECT access_until FROM user_access WHERE user_id = ?")
      .get(invoice.user_id) as unknown as
      | { access_until: number | null }
      | undefined;
    const base = Math.max(now, current?.access_until ?? 0);
    const newUntil = base + invoice.duration_days * 86_400;

    db.prepare(
      `UPDATE crypto_invoices
       SET status = 'approved', reviewed_by = ?, reviewed_at = ?,
           review_note = ?, approved_until = ?
       WHERE id = ? AND status = 'submitted'`,
    ).run(adminId, now, note?.trim() || null, newUntil, invoiceId);

    db.prepare(
      `INSERT INTO user_access (user_id, plan_code, access_until, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         plan_code = excluded.plan_code,
         access_until = excluded.access_until,
         updated_at = excluded.updated_at`,
    ).run(invoice.user_id, invoice.plan_code, newUntil, now);

    db.prepare(
      `INSERT INTO audit_log (id, actor_user_id, action, target, metadata_json, created_at)
       VALUES (?, ?, 'payment.approve', ?, ?, ?)`,
    ).run(
      `aud_${randomBytes(12).toString("hex")}`,
      adminId,
      invoiceId,
      JSON.stringify({ userId: invoice.user_id, planCode: invoice.plan_code, accessUntil: newUntil }),
      now,
    );

    db.exec("COMMIT");
    return { invoice: getInvoice(invoiceId) ?? undefined };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function rejectInvoice(
  adminId: string,
  invoiceId: string,
  note?: string,
): { invoice?: InvoiceRow; error?: "INVOICE_NOT_FOUND" | "INVALID_STATUS" } {
  const db = getAppDb();
  const now = Math.floor(Date.now() / 1000);
  const invoice = db
    .prepare("SELECT * FROM crypto_invoices WHERE id = ?")
    .get(invoiceId) as unknown as InvoiceRow | undefined;
  if (!invoice) return { error: "INVOICE_NOT_FOUND" };
  if (invoice.status !== "submitted") return { error: "INVALID_STATUS" };

  db.prepare(
    `UPDATE crypto_invoices
     SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ?
     WHERE id = ? AND status = 'submitted'`,
  ).run(adminId, now, note?.trim() || null, invoiceId);

  db.prepare(
    `INSERT INTO audit_log (id, actor_user_id, action, target, metadata_json, created_at)
     VALUES (?, ?, 'payment.reject', ?, ?, ?)`,
  ).run(
    `aud_${randomBytes(12).toString("hex")}`,
    adminId,
    invoiceId,
    JSON.stringify({ userId: invoice.user_id, note: note ?? null }),
    now,
  );

  return { invoice: getInvoice(invoiceId) ?? undefined };
}

export function recordAudit(
  actorUserId: string | null,
  action: string,
  target: string | null,
  metadata?: Record<string, unknown>,
): void {
  getAppDb()
    .prepare(
      `INSERT INTO audit_log (id, actor_user_id, action, target, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `aud_${randomBytes(12).toString("hex")}`,
      actorUserId,
      action,
      target,
      metadata ? JSON.stringify(metadata) : null,
      Math.floor(Date.now() / 1000),
    );
}
