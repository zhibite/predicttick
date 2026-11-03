import { getCurrentUser } from "@/server/auth";
import {
  EXPECTED_WALLETS,
  getPaymentWallets,
  paymentsEnabled,
  recordAudit,
  upsertPaymentWallet,
} from "@/server/billing";
import {
  assertSameOrigin,
  jsonError,
  jsonOk,
} from "@/server/http";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("UNAUTHORIZED", "Sign in required.", 401) };
  if (user.role !== "admin") {
    return { error: jsonError("FORBIDDEN", "Admin access required.", 403) };
  }
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  return jsonOk({
    wallets: getPaymentWallets(),
    expected: EXPECTED_WALLETS,
    paymentsEnabled: paymentsEnabled(),
  });
}

function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isTronAddress(value: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
}

export async function PUT(request: Request) {
  if (!assertSameOrigin(request)) {
    return jsonError("BAD_ORIGIN", "Invalid request origin.", 403);
  }

  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: {
    network?: unknown;
    currency?: unknown;
    tokenContract?: unknown;
    tokenDecimals?: unknown;
    depositAddress?: unknown;
    explorerBase?: unknown;
    active?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.");
  }

  if (
    typeof body.network !== "string" ||
    typeof body.currency !== "string" ||
    typeof body.tokenContract !== "string" ||
    typeof body.tokenDecimals !== "number" ||
    typeof body.depositAddress !== "string" ||
    typeof body.explorerBase !== "string" ||
    typeof body.active !== "boolean"
  ) {
    return jsonError("BAD_INPUT", "Invalid wallet configuration.");
  }

  const expected = EXPECTED_WALLETS.find(
    (item) =>
      item.network === body.network && item.currency === body.currency,
  );
  if (!expected) {
    return jsonError(
      "BAD_NETWORK",
      "Only TRC20 USDT, Base USDC, Polygon USDT and Polygon USDC are supported.",
    );
  }

  const tokenContract = body.tokenContract.trim();
  const depositAddress = body.depositAddress.trim();
  const explorerBase = body.explorerBase.trim();

  if (!/^https?:\/\//.test(explorerBase)) {
    return jsonError("BAD_EXPLORER", "Enter a valid explorer URL.");
  }
  if (
    !Number.isInteger(body.tokenDecimals) ||
    body.tokenDecimals < 0 ||
    body.tokenDecimals > 18
  ) {
    return jsonError("BAD_DECIMALS", "Token decimals must be 0-18.");
  }

  if (body.active) {
    if (body.tokenDecimals <= 0) {
      return jsonError(
        "BAD_DECIMALS",
        "Set token decimals before enabling a network.",
      );
    }
    if (!tokenContract) {
      return jsonError("BAD_CONTRACT", "Token contract is required.");
    }
    if (!depositAddress) {
      return jsonError("BAD_ADDRESS", "Deposit address is required.");
    }
    if (
      body.network === "tron" &&
      (!isTronAddress(tokenContract) || !isTronAddress(depositAddress))
    ) {
      return jsonError(
        "BAD_ADDRESS",
        "Enter valid Tron addresses/contracts.",
      );
    }
    if (
      body.network !== "tron" &&
      (!isEvmAddress(tokenContract) || !isEvmAddress(depositAddress))
    ) {
      return jsonError(
        "BAD_ADDRESS",
        "Enter valid EVM addresses/contracts.",
      );
    }
  }

  try {
    const wallet = upsertPaymentWallet({
      network: body.network,
      currency: body.currency,
      tokenContract,
      tokenDecimals: body.tokenDecimals,
      depositAddress,
      explorerBase,
      active: body.active,
    });
    recordAudit(auth.user.id, "payment_wallet.update", `${wallet.network}:${wallet.currency}`, {
      active: wallet.active,
      tokenContract: wallet.token_contract,
      depositAddress: wallet.deposit_address,
    });
    return jsonOk({ wallet });
  } catch (error) {
    console.error("PUT /api/admin/payment-wallets failed", error);
    return jsonError("SAVE_FAILED", "Could not save the wallet.", 500);
  }
}
