import type { CurrentUser } from "@/server/user-types";
import { getEntitlements } from "@/server/entitlements";
import { currentUtcDay, utcDayFromEpoch } from "@/server/usage";

const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ApiRange {
  from: string;
  to: string;
  fromEpoch: number;
  toEpochExclusive: number;
}

export interface ApiRangeError {
  code: string;
  message: string;
  status: number;
}

export function parseApiRange(
  user: CurrentUser,
  fromValue: string | null,
  toValue: string | null,
  defaultDays = 7,
): { range?: ApiRange; error?: ApiRangeError } {
  const today = currentUtcDay();
  const todayEpoch = Math.floor(Date.parse(`${today}T00:00:00Z`) / 1000);
  const to = toValue || today;
  const from =
    fromValue ||
    utcDayFromEpoch(todayEpoch - (defaultDays - 1) * 86_400);

  if (!SAFE_DATE.test(from) || !SAFE_DATE.test(to)) {
    return {
      error: {
        code: "BAD_DATE",
        message: "Dates must use YYYY-MM-DD.",
        status: 400,
      },
    };
  }
  const fromEpoch = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000);
  const toEpoch = Math.floor(Date.parse(`${to}T00:00:00Z`) / 1000);
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
  if (to > today) {
    return {
      error: {
        code: "FUTURE_DATE",
        message: "to cannot be in the future.",
        status: 400,
      },
    };
  }

  const entitlements = getEntitlements(user);
  const earliestEpoch = todayEpoch - entitlements.historyDays * 86_400;
  if (fromEpoch < earliestEpoch) {
    return {
      error: {
        code: "HISTORY_LIMIT",
        message: `Your plan can access data from ${utcDayFromEpoch(earliestEpoch)} onward.`,
        status: 403,
      },
    };
  }

  return {
    range: {
      from,
      to,
      fromEpoch,
      toEpochExclusive: toEpoch + 86_400,
    },
  };
}
