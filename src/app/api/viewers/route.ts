import { z } from "zod";
import { heartbeatViewer, getViewerCount } from "@/lib/viewers";
import {
  validateQuery,
  validateBody,
  viewerHeartbeatSchema,
} from "@/lib/validators";

export const dynamic = "force-dynamic";

const viewersGetSchema = z.object({
  matchId: z.string().regex(/^\d+$/, "Invalid match ID"),
});

export async function GET(request: Request) {
  const validation = await validateQuery(request, viewersGetSchema);
  if ("error" in validation) return validation.error;

  const count = await getViewerCount(validation.data.matchId);
  return Response.json({ count });
}

export async function POST(request: Request) {
  const validation = await validateBody(request, viewerHeartbeatSchema);
  if ("error" in validation) return validation.error;

  const { matchId, viewerId } = validation.data;
  const count = await heartbeatViewer(matchId, viewerId);
  return Response.json({ count });
}
