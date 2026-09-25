import { z } from "zod";

export const matchesQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
    .optional(),
});

export const matchIdParamsSchema = z.object({
  matchId: z.string().regex(/^\d+$/, "Invalid match ID"),
});

export const matchIdQuerySchema = z.object({
  streamId: z.string().optional(),
  eventSlug: z.string().optional(),
  eventSources: z.string().optional(),
  player: z.enum(["1", "2"]).optional(),
  home: z.string().min(1).max(100).optional(),
  away: z.string().min(1).max(100).optional(),
  league: z.string().min(1).max(100).optional(),
});

export const chatPostSchema = z.object({
  matchId: z.string().regex(/^\d+$/, "Invalid match ID"),
  nick: z.string().min(1).max(20).regex(/^[a-zA-Z0-9 _-]+$/),
  text: z.string().min(1).max(500),
});

export const standingsQuerySchema = z.object({
  leagueId: z.string().regex(/^\d+$/, "Invalid league ID"),
  season: z.string().regex(/^\d{4}$/).optional(),
});

export const leaguesQuerySchema = z.object({
  country: z.string().optional(),
});

export const healthQuerySchema = z.object({
  detailed: z.enum(["true", "false"]).optional(),
});

export type MatchesQuery = z.infer<typeof matchesQuerySchema>;
export type MatchIdParams = z.infer<typeof matchIdParamsSchema>;
export type MatchIdQuery = z.infer<typeof matchIdQuerySchema>;
export type ChatPost = z.infer<typeof chatPostSchema>;
export type StandingsQuery = z.infer<typeof standingsQuerySchema>;
export type LeaguesQuery = z.infer<typeof leaguesQuerySchema>;
export type HealthQuery = z.infer<typeof healthQuerySchema>;

export function createErrorResponse(message: string, status: number = 400): Response {
  return Response.json({ error: message }, { status });
}

export async function validateQuery<T extends z.ZodSchema>(
  request: Request,
  schema: T
): Promise<{ data: z.infer<T> } | { error: Response }> {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { error: createErrorResponse(`Validation failed: ${issues}`, 400) };
  }
  return { data: result.data };
}

export async function validateBody<T extends z.ZodSchema>(
  request: Request,
  schema: T
): Promise<{ data: z.infer<T> } | { error: Response }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return { error: createErrorResponse(`Validation failed: ${issues}`, 400) };
    }
    return { data: result.data };
  } catch {
    return { error: createErrorResponse("Invalid JSON body", 400) };
  }
}

export async function validateParams<T extends z.ZodSchema>(
  params: Promise<Record<string, string>>,
  schema: T
): Promise<{ data: z.infer<T> } | { error: Response }> {
  const resolved = await params;
  const result = schema.safeParse(resolved);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { error: createErrorResponse(`Validation failed: ${issues}`, 400) };
  }
  return { data: result.data };
}