import { z } from "zod";
import { heartbeatViewer, getViewerCount, removeViewer } from "@/lib/viewers";

export const dynamic = "force-dynamic";

/**
 * Site-wide presence: every visitor heartbeats here regardless of which
 * page they are on, so the admin panel can count how many people are on
 * the site at once (watching a match or not).
 */
const PRESENCE_ID = "__site__";

const postSchema = z.object({
  viewerId: z.string().min(1).max(128),
  action: z.enum(["join", "leave"]).optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const validation = postSchema.safeParse(body);
  if (!validation.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { viewerId, action } = validation.data;
  const count =
    action === "leave"
      ? await removeViewer(PRESENCE_ID, viewerId)
      : await heartbeatViewer(PRESENCE_ID, viewerId);

  return Response.json({ count });
}

/** Current number of people on the site (active in the last ~45s). */
export async function GET(): Promise<Response> {
  const count = await getViewerCount(PRESENCE_ID);
  return Response.json({ count });
}
