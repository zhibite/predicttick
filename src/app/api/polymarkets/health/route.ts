import { NextResponse } from "next/server";
import fs from "node:fs";
import { ASSETS } from "@/lib/db/constants";
import { getDataDir, listAssetDbFiles } from "@/lib/db/path";

export const dynamic = "force-dynamic";

/**
 * GET /api/polymarkets/health
 * 数据源连通性检查，返回每个资产 db 的存在性和体量。
 */
export async function GET() {
  const dir = getDataDir();
  const exists = fs.existsSync(dir);
  const assets = ASSETS.map((asset) => {
    const files = listAssetDbFiles(asset);
    const totalSize = files.reduce((sum, p) => {
      try {
        return sum + fs.statSync(p).size;
      } catch {
        return sum;
      }
    }, 0);
    return {
      asset,
      files: files.map((p) => p.split(/[\\/]/).pop()),
      totalMb: Math.round(totalSize / (1024 * 1024)),
    };
  });
  return NextResponse.json({
    dataDir: dir,
    exists,
    assets,
    checkedAt: new Date().toISOString(),
  });
}
