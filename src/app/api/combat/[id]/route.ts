import { NextResponse } from "next/server";
import { findCombatMatch } from "@/lib/combat-source";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const matchId = Number.parseInt(id, 10);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const match = await findCombatMatch(matchId);
    if (!match) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const sources = match.streams
      .map((stream) => stream.embed_url ?? stream.real_url)
      .filter((url): url is string => Boolean(url))
      .map((src, idx) => ({ src, kind: "iframe" as const, quality: idx === 0 ? "HD" : undefined }));
    return NextResponse.json({
      src: sources[0]?.src ?? null,
      kind: sources[0]?.kind ?? null,
      sources,
      live: match.live,
    });
  } catch (error) {
    console.error("[api/combat/[id]]", error);
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }
}
