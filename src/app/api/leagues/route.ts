import { SUPPORTED_LEAGUES } from "@/lib/constants";
import { validateQuery, leaguesQuerySchema } from "@/lib/validators";

export async function GET(request: Request) {
  const validation = await validateQuery(request, leaguesQuerySchema);
  if ("error" in validation) return validation.error;

  const leagues = SUPPORTED_LEAGUES;
  return Response.json({ leagues });
}
