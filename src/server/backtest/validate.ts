import { PERIODS } from "@/lib/types";
import type { CurrentUser } from "@/server/user-types";
import { getEntitlements } from "@/server/entitlements";
import { currentUtcDay, utcDayFromEpoch } from "@/server/usage";

const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ASSET = /^[a-z0-9]+$/;
export const MAX_SOURCE_BYTES = 64 * 1024;
export const MAX_PARAMS_BYTES = 16 * 1024;

export interface BacktestRange {
  from: string;
  to: string;
  fromEpoch: number;
  toEpochExclusive: number;
}

export interface ValidationError {
  code: string;
  message: string;
  status: number;
}

export function parseBacktestRange(
  user: CurrentUser,
  fromValue: string,
  toValue: string,
): { range?: BacktestRange; error?: ValidationError } {
  if (!SAFE_DATE.test(fromValue) || !SAFE_DATE.test(toValue)) {
    return {
      error: {
        code: "BAD_DATE",
        message: "Use YYYY-MM-DD dates.",
        status: 400,
      },
    };
  }
  const fromEpoch = Math.floor(Date.parse(`${fromValue}T00:00:00Z`) / 1000);
  const toEpoch = Math.floor(Date.parse(`${toValue}T00:00:00Z`) / 1000);
  if (!Number.isFinite(fromEpoch) || !Number.isFinite(toEpoch)) {
    return {
      error: { code: "BAD_DATE", message: "Invalid date.", status: 400 },
    };
  }
  if (fromEpoch > toEpoch) {
    return {
      error: {
        code: "BAD_DATE",
        message: "from must be before or equal to to.",
        status: 400,
      },
    };
  }

  const today = currentUtcDay();
  if (toValue > today) {
    return {
      error: {
        code: "FUTURE_DATE",
        message: "Backtests cannot use future data.",
        status: 400,
      },
    };
  }

  const entitlements = getEntitlements(user);
  const todayEpoch = Math.floor(Date.parse(`${today}T00:00:00Z`) / 1000);
  const earliest = todayEpoch - entitlements.historyDays * 86_400;
  if (fromEpoch < earliest) {
    return {
      error: {
        code: "HISTORY_LIMIT",
        message: `Your plan can use data from ${utcDayFromEpoch(earliest)} onward.`,
        status: 403,
      },
    };
  }
  const days = Math.floor((toEpoch - fromEpoch) / 86_400) + 1;
  if (days > entitlements.backtestMaxDays) {
    return {
      error: {
        code: "RANGE_TOO_LARGE",
        message: `Your plan allows at most ${entitlements.backtestMaxDays} days per run.`,
        status: 400,
      },
    };
  }

  return {
    range: {
      from: fromValue,
      to: toValue,
      fromEpoch,
      toEpochExclusive: toEpoch + 86_400,
    },
  };
}

export function validateStrategySyntax(source: string): ValidationError | null {
  try {
    // Compile-only check. This does not execute user code; QuickJS performs
    // the real sandboxed execution when the run starts.
    new Function(source);
    return null;
  } catch (error) {
    return {
      code: "BAD_SOURCE",
      message: `Strategy source does not compile: ${
        error instanceof Error ? error.message : String(error)
      }`,
      status: 400,
    };
  }
}

export function validateBacktestBasics(input: {
  asset: string;
  period: string;
  source: string;
  params: unknown;
  stake: number;
  slippageBps: number;
  feeBps: number;
  minSamples: number;
}): ValidationError | null {
  if (!SAFE_ASSET.test(input.asset)) {
    return { code: "BAD_ASSET", message: "Invalid asset.", status: 400 };
  }
  if (!PERIODS.includes(input.period as (typeof PERIODS)[number])) {
    return {
      code: "BAD_PERIOD",
      message: "period must be one of 5m, 15m, 1h, 4h.",
      status: 400,
    };
  }
  if (Buffer.byteLength(input.source, "utf8") > MAX_SOURCE_BYTES) {
    return {
      code: "SOURCE_TOO_LARGE",
      message: "Strategy source is larger than 64 KB.",
      status: 400,
    };
  }
  if (!input.params || typeof input.params !== "object" || Array.isArray(input.params)) {
    return {
      code: "BAD_PARAMS",
      message: "params must be a JSON object.",
      status: 400,
    };
  }
  if (Buffer.byteLength(JSON.stringify(input.params), "utf8") > MAX_PARAMS_BYTES) {
    return {
      code: "PARAMS_TOO_LARGE",
      message: "Strategy params are larger than 16 KB.",
      status: 400,
    };
  }
  if (!Number.isFinite(input.stake) || input.stake <= 0 || input.stake > 1e9) {
    return {
      code: "BAD_STAKE",
      message: "stake must be a positive number.",
      status: 400,
    };
  }
  if (
    !Number.isFinite(input.slippageBps) ||
    input.slippageBps < 0 ||
    input.slippageBps > 1_000
  ) {
    return {
      code: "BAD_SLIPPAGE",
      message: "slippageBps must be between 0 and 1000.",
      status: 400,
    };
  }
  if (!Number.isFinite(input.feeBps) || input.feeBps < 0 || input.feeBps > 1_000) {
    return {
      code: "BAD_FEE",
      message: "feeBps must be between 0 and 1000.",
      status: 400,
    };
  }
  if (
    !Number.isInteger(input.minSamples) ||
    input.minSamples < 0 ||
    input.minSamples > 10_000
  ) {
    return {
      code: "BAD_MIN_SAMPLES",
      message: "minSamples must be 0-10000.",
      status: 400,
    };
  }
  return null;
}
