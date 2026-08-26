/**
 * 通用工具：时间格式化、UTC+8 偏移等。
 *
 * Polymarket slug 形如 `btc-updown-5m-1782390000`，最后一段是窗口开始的 unix 秒。
 * 数据库 time_ms 是 unix 毫秒。
 */
export const BEIJING_OFFSET_SEC = 8 * 3600;

export function epochToBeijingMs(epochSec: number): number {
  return (epochSec + BEIJING_OFFSET_SEC) * 1000;
}

export function epochToBeijingSec(epochSec: number): number {
  return epochSec + BEIJING_OFFSET_SEC;
}

export function msToBeijingSec(ms: number): number {
  return Math.floor(ms / 1000) + BEIJING_OFFSET_SEC;
}

const pad2 = (n: number) => n.toString().padStart(2, "0");

/** yyyy-MM-dd HH:mm:ss 北京时间 */
export function fmtBeijingDateTime(epochSec: number): string {
  const d = new Date(epochToBeijingMs(epochSec));
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
  );
}

/** yyyy-MM-dd HH:mm 北京时间（紧凑） */
export function fmtBeijingShort(epochSec: number): string {
  const d = new Date(epochToBeijingMs(epochSec));
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
  );
}

/** HH:mm:ss 北京时间 */
export function fmtBeijingTime(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function assetIcon(name: string): string {
  const upper = name.toUpperCase();
  const map: Record<string, string> = {
    BTC: "₿",
    ETH: "Ξ",
    BNB: "🔶",
    SOL: "◎",
    XRP: "✕",
    DOGE: "Ð",
    HYPE: "⚡",
  };
  return map[upper] ?? upper[0] ?? "?";
}
