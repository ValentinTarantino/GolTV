import { getMatchById } from "@/lib/api-football";
import { getStreamsForMatch } from "@/lib/streaming";
import { LIVE_STATUSES } from "@/lib/constants";

export const revalidate = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const id = parseInt(matchId, 10);

  if (isNaN(id)) {
    return Response.json({ error: "Invalid match ID" }, { status: 400 });
  }

  const match = await getMatchById(id);

  if (!match) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }

  if (LIVE_STATUSES.includes(match.status.short)) {
    const streams = await getStreamsForMatch(
      match.homeTeam.name,
      match.awayTeam.name
    );

    if (streams.length > 0) {
      match.channels = streams;
    }
  }

  return Response.json({ match });
}
