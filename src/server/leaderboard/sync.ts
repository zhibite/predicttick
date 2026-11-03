import {
  fetchClosedPositions,
  fetchLeaderboardStanding,
  fetchPortfolioValue,
  fetchPositions,
  fetchPublicProfile,
  fetchTrades,
  fetchUserStats,
} from "./api";
import { computeLeaderboardMetrics } from "./analytics";
import {
  getLeaderboardUserByAddress,
  getLeaderboardUserById,
  getStoredActivity,
  getStoredClosedPositions,
  getStoredPositions,
  listLeaderboardUsers,
  markLeaderboardSyncStatus,
  normalizeTraderAddress,
  replaceActivity,
  replaceClosedPositions,
  replacePositions,
  resetStaleLeaderboardSync,
  saveLeaderboardSyncResult,
} from "./store";
import type { TraderProfile } from "./types";

export interface SyncResult {
  address: string;
  ok: boolean;
  error?: string;
  warning?: string;
}

export interface SyncAllSummary {
  synced: number;
  failed: number;
  skipped: number;
  results: SyncResult[];
}

const inFlight = new Set<string>();

function errorText(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  return message.slice(0, 300);
}

export function leaderboardSyncMinutes(): number {
  const parsed = Number.parseInt(
    process.env.POLY_LEADERBOARD_SYNC_MINUTES ?? "",
    10,
  );
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(24 * 60, Math.max(5, parsed));
}

function profileFromActivity(
  activity: ReturnType<typeof getStoredActivity>,
): TraderProfile {
  const profile: TraderProfile = {
    name: null,
    pseudonym: null,
    bio: null,
    image: null,
  };
  for (const trade of activity) {
    profile.name ??= trade.traderName;
    profile.pseudonym ??= trade.traderPseudonym;
    profile.bio ??= trade.traderBio;
    profile.image ??= trade.traderImage;
  }
  return profile;
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/**
 * Fetch and persist everything we know about one trader.
 *
 * Each upstream endpoint is fetched independently: a temporary failure in one
 * (for example the profile endpoint) must not discard the rest of the sync.
 * Rows are replaced only for successful sources, so previous data survives a
 * partial outage.
 */
export async function syncLeaderboardUser(
  input: string,
): Promise<SyncResult> {
  const normalized = normalizeTraderAddress(input);
  const user =
    (normalized ? getLeaderboardUserByAddress(normalized) : null) ??
    getLeaderboardUserById(input);

  if (!user) {
    return { address: input, ok: false, error: "Trader not found." };
  }
  if (inFlight.has(user.address)) {
    return {
      address: user.address,
      ok: false,
      error: "A sync is already running for this address.",
    };
  }

  inFlight.add(user.address);
  markLeaderboardSyncStatus(user.address, "syncing");

  try {
    const results = await Promise.allSettled([
      fetchPublicProfile(user.address),
      fetchPortfolioValue(user.address),
      fetchPositions(user.address),
      fetchClosedPositions(user.address),
      fetchTrades(user.address),
      fetchUserStats(user.address),
      fetchLeaderboardStanding(user.address),
    ] as const);

    const [
      profileResult,
      valueResult,
      positionsResult,
      closedResult,
      activityResult,
      statsResult,
      standingResult,
    ] = results;

    const warnings: string[] = [];

    if (positionsResult.status === "fulfilled") {
      try {
        replacePositions(user.address, positionsResult.value);
      } catch (error) {
        warnings.push(`positions storage: ${errorText(error)}`);
      }
    } else {
      warnings.push(`positions: ${errorText(positionsResult.reason)}`);
    }

    if (closedResult.status === "fulfilled") {
      try {
        replaceClosedPositions(user.address, closedResult.value);
      } catch (error) {
        warnings.push(`closed positions storage: ${errorText(error)}`);
      }
    } else {
      warnings.push(`closed positions: ${errorText(closedResult.reason)}`);
    }

    if (activityResult.status === "fulfilled") {
      try {
        replaceActivity(user.address, activityResult.value);
      } catch (error) {
        warnings.push(`activity storage: ${errorText(error)}`);
      }
    } else {
      warnings.push(`activity: ${errorText(activityResult.reason)}`);
    }

    // The profile and portfolio-value endpoints are auxiliary. If every core
    // data source (positions, closed positions, activity) is down, treat the
    // sync as failed rather than overwriting metrics from stale rows.
    if (
      positionsResult.status === "rejected" &&
      closedResult.status === "rejected" &&
      activityResult.status === "rejected"
    ) {
      const message = errorText(positionsResult.reason);
      markLeaderboardSyncStatus(user.address, "error", message);
      return { address: user.address, ok: false, error: message };
    }

    if (profileResult.status === "rejected") {
      warnings.push(`profile: ${errorText(profileResult.reason)}`);
    }
    if (valueResult.status === "rejected") {
      warnings.push(`portfolio value: ${errorText(valueResult.reason)}`);
    }
    if (statsResult.status === "rejected") {
      warnings.push(`lifetime stats: ${errorText(statsResult.reason)}`);
    }
    if (standingResult.status === "rejected") {
      warnings.push(`leaderboard rank: ${errorText(standingResult.reason)}`);
    }

    const positions = getStoredPositions(user.address);
    const closedPositions = getStoredClosedPositions(user.address);
    const activity = getStoredActivity(user.address);

    const fetchedProfile =
      profileResult.status === "fulfilled" ? profileResult.value : null;
    const activityProfile = profileFromActivity(activity);
    const profile: TraderProfile = {
      name: firstText(fetchedProfile?.name, activityProfile.name, user.profile_name),
      pseudonym: firstText(
        fetchedProfile?.pseudonym,
        activityProfile.pseudonym,
        user.profile_pseudonym,
      ),
      bio: firstText(fetchedProfile?.bio, activityProfile.bio, user.profile_bio),
      image: firstText(
        fetchedProfile?.image,
        activityProfile.image,
        user.profile_image,
      ),
    };

    const fallbackValue = positions.reduce(
      (total, position) => total + position.currentValue,
      0,
    );
    const portfolioValue =
      valueResult.status === "fulfilled" && valueResult.value != null
        ? valueResult.value
        : fallbackValue;

    const metrics = computeLeaderboardMetrics({
      positions,
      closedPositions,
      trades: activity,
      portfolioValue,
      lifetime:
        statsResult.status === "fulfilled" ? statsResult.value : null,
      standing:
        standingResult.status === "fulfilled" ? standingResult.value : null,
    });
    const warning =
      warnings.length > 0 ? warnings.join("; ").slice(0, 600) : null;

    saveLeaderboardSyncResult({
      address: user.address,
      profile,
      metrics,
      warning,
    });

    return {
      address: user.address,
      ok: true,
      ...(warning ? { warning } : {}),
    };
  } catch (error) {
    const message = errorText(error);
    console.error(`[leaderboard] sync failed for ${user.address}`, error);
    markLeaderboardSyncStatus(user.address, "error", message);
    return { address: user.address, ok: false, error: message };
  } finally {
    inFlight.delete(user.address);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncAllLeaderboardUsers(
  options: { force?: boolean } = {},
): Promise<SyncAllSummary> {
  const users = listLeaderboardUsers(false);
  const now = Math.floor(Date.now() / 1000);
  const interval = leaderboardSyncMinutes() * 60;

  const due = users.filter(
    (user) =>
      !inFlight.has(user.address) &&
      (options.force ||
        user.last_synced_at == null ||
        now - user.last_synced_at >= interval ||
        user.sync_status === "error"),
  );

  const results: SyncResult[] = [];
  const concurrency = 2;

  for (let index = 0; index < due.length; index += concurrency) {
    const batch = due.slice(index, index + concurrency);
    results.push(
      ...(await Promise.all(
        batch.map((user) => syncLeaderboardUser(user.id)),
      )),
    );
    if (index + concurrency < due.length) await sleep(500);
  }

  return {
    synced: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    skipped: users.length - due.length,
    results,
  };
}

type UnrefTimer = { unref?: () => void };

type GlobalWithLeaderboardSync = typeof globalThis & {
  __polyklinesLeaderboardSync?: boolean;
};

const globalStore = globalThis as GlobalWithLeaderboardSync;

/**
 * Background refresh loop owned by the web process. It starts with the server
 * (see instrumentation.ts) unless POLY_LEADERBOARD_SYNC=0. Only active
 * addresses are refreshed, and each address is skipped until it is due.
 */
export function startLeaderboardSync(): void {
  if (globalStore.__polyklinesLeaderboardSync) return;
  globalStore.__polyklinesLeaderboardSync = true;

  resetStaleLeaderboardSync();
  const minutes = leaderboardSyncMinutes();
  let running = false;

  const run = () => {
    if (running) return;
    running = true;
    syncAllLeaderboardUsers()
      .then((summary) => {
        if (summary.synced > 0 || summary.failed > 0) {
          console.log(
            `[leaderboard] sync finished: ${summary.synced} ok, ${summary.failed} failed, ${summary.skipped} skipped`,
          );
        }
      })
      .catch((error) => {
        console.error("[leaderboard] background sync failed", error);
      })
      .finally(() => {
        running = false;
      });
  };

  const initial = setTimeout(run, 60_000) as unknown as UnrefTimer;
  initial.unref?.();
  const timer = setInterval(run, minutes * 60_000) as unknown as UnrefTimer;
  timer.unref?.();

  console.log(`[leaderboard] background sync enabled every ${minutes}m`);
}
