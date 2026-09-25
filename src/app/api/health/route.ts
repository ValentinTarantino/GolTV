import { getApiFootballUsage } from "@/lib/api-football";
import { getAgendaUsage } from "@/lib/agenda-source";
import { getStreamUsage } from "@/lib/streaming";
import { validateQuery, healthQuerySchema } from "@/lib/validators";

export const revalidate = 0;

export async function GET(request: Request) {
  const validation = await validateQuery(request, healthQuerySchema);
  if ("error" in validation) return validation.error;

  const { detailed } = validation.data;

  const baseResponse = {
    timestamp: new Date().toISOString(),
    apis: {
      apiFootball: {
        description: "API-Football (api-sports.io)",
        keys: getApiFootballUsage(),
      },
      agendaSource: {
        description: "Agenda + streams",
        ...getAgendaUsage(),
      },
      rapidApi: {
        description: "RapidAPI streaming (fallback)",
        ...getStreamUsage(),
      },
    },
  };

  if (detailed === "true") {
    return Response.json({
      ...baseResponse,
      cache: (await import("@/lib/cache")).getMemoryCacheStats(),
    });
  }

  return Response.json(baseResponse);
}
