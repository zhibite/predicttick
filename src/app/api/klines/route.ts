import { NextResponse } from "next/server";

import { getWindow, parseSlug } from "@/lib/dataset";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!parseSlug(slug)) {
    return NextResponse.json({ error: "Invalid market slug." }, { status: 400 });
  }

  try {
    const data = await getWindow(slug);
    if (!data) {
      return NextResponse.json(
        { error: "Window not found in the dataset." },
        { status: 404 },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error(`GET /api/klines ${slug} failed`, error);
    return NextResponse.json(
      { error: "Failed to read the window klines." },
      { status: 500 },
    );
  }
}
