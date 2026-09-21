import { NextRequest } from "next/server";
import { fetchLeagueStandings } from "@/lib/standings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const league = searchParams.get("league");

  if (!league) {
    return Response.json({ error: "Missing league parameter" }, { status: 400 });
  }

  const leagueId = parseInt(league, 10);
  if (isNaN(leagueId)) {
    return Response.json({ error: "Invalid league parameter" }, { status: 400 });
  }

  const data = await fetchLeagueStandings(leagueId);

  return Response.json(data);
}
