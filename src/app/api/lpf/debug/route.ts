import { inspectSportplusPage, listLpfMatches } from "@/lib/lpf-matches";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const matches = await listLpfMatches();
  const live = matches.find((match) => match.status === "live") ?? matches[0];

  const sportplus =
    live?.source === "sportplus"
      ? await inspectSportplusPage("220557", "8400999")
      : null;

  return Response.json(
    {
      matches: matches.length,
      live: live ? { home: live.home, away: live.away, status: live.status } : null,
      sportplus,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
