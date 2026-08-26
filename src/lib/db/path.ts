/**
 * Polymarket 数据源路径解析与多文件发现（仅服务端使用，含 node:* 依赖）。
 *
 * - 默认指向 gmgndata 工程的 data/ 目录（只读）
 * - 支持环境变量覆盖：GMGN_DATA_DIR
 * - 自动发现 btc* / eth* / ... 命名的所有 SQLite 文件，
 *   未来按年分库（btc_2026.db / btc_2027.db）无需改代码
 *
 * ⚠️ 不要在客户端组件中直接 import 此文件（包含 node:fs）。
 *   客户端组件请引用 `./constants` 中的常量。
 */
import path from "node:path";
import fs from "node:fs";
import { ASSETS, type Asset } from "./constants";

export { ASSETS, PERIODS, PERIOD_SECONDS } from "./constants";
export type { Asset, Period } from "./constants";

const DEFAULT_DATA_DIR = "D:\\05.project2\\10.polymarket\\8.gmgndata\\data";

export function getDataDir(): string {
  const fromEnv = process.env.GMGN_DATA_DIR;
  const dir = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_DATA_DIR;
  return path.resolve(dir);
}

function stripAssetPrefix(file: string, asset: string): string | null {
  const lower = file.toLowerCase();
  if (lower === `${asset}.db`) return asset;
  if (lower.startsWith(`${asset}_`) && lower.endsWith(".db")) {
    return lower.slice(0, -3);
  }
  return null;
}

export function listAssetDbFiles(asset: Asset): string[] {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir);
  const matches: string[] = [];
  for (const name of entries) {
    const normalized = stripAssetPrefix(name, asset);
    if (normalized) matches.push(path.join(dir, name));
  }
  matches.sort();
  return matches;
}

export function marketsDbPath(): string {
  const dir = getDataDir();
  const candidates = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((n) => n === "markets.db" || /^markets_\d+\.db$/.test(n))
    : [];
  if (candidates.length > 0) {
    candidates.sort();
    return path.join(dir, candidates[candidates.length - 1]);
  }
  return path.join(dir, "markets.db");
}

export function listAvailableAssets(): Asset[] {
  const found: Asset[] = [];
  for (const asset of ASSETS) {
    if (listAssetDbFiles(asset).length > 0) found.push(asset);
  }
  return found;
}

export function fileSizeMb(p: string): number {
  try {
    return fs.statSync(p).size / (1024 * 1024);
  } catch {
    return 0;
  }
}
