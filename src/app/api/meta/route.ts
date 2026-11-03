import { NextResponse } from "next/server";

import { getMeta } from "@/lib/dataset";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const meta = await getMeta();
    return NextResponse.json(meta);
  } catch (error) {
    console.error("GET /api/meta failed", error);
    return NextResponse.json(
      { error: "Failed to read the dataset directory." },
      { status: 500 },
    );
  }
}
