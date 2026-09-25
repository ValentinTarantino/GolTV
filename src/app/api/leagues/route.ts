import { fetchLeagues } from "@/lib/api-football";
import { validateQuery, leaguesQuerySchema } from "@/lib/validators";

export async function GET(request: Request) {
  const validation = await validateQuery(request, leaguesQuerySchema);
  if ("error" in validation) return validation.error;

  const leagues = fetchLeagues();
  return Response.json({ leagues });
}
