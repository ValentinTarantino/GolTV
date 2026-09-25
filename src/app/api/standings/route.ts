import { NextRequest } from "next/server";
import { fetchLeagueStandings } from "@/lib/standings";
import { validateQuery, createErrorResponse, standingsQuerySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const validation = await validateQuery(request, standingsQuerySchema);
  if ("error" in validation) return validation.error;

  const { leagueId } = validation.data;
  const id = parseInt(leagueId, 10);

  if (isNaN(id)) {
    return createErrorResponse("Invalid league parameter", 400);
  }

  const data = await fetchLeagueStandings(id);

  return Response.json(data);
}
