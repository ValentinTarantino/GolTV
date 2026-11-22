import { getApiFootballUsage } from "@/lib/api-football";
import { getAgendaUsage } from "@/lib/agenda-source";
import { getStreamUsage } from "@/lib/streaming";
import { validateQuery, healthQuerySchema } from "@/lib/validators";
import { getDb, isMongoConfigured } from "@/lib/mongo";

export const revalidate = 0;

export async function GET(request: Request) {
  const validation = await validateQuery(request, healthQuerySchema);
  if ("error" in validation) return validation.error;

  const { detailed } = validation.data;

  // `connected` is a real getDb() probe: false means every Mongo-backed
  // feature (chat persistence, viewer counts, admin league order) is running
  // on the memory fallback and will reset on the next deploy.
  const db = await getDb();

  const baseResponse = {
    timestamp: new Date().toISOString(),
    apis: {
      apiFootball: {
        description: "Fixture data provider",
        keys: getApiFootballUsage(),
      },
      agendaSource: {
        description: "Agenda + streams",
        ...getAgendaUsage(),
      },
      rapidApi: {
        description: "Streaming provider (fallback)",
        ...getStreamUsage(),
      },
    },
    mongo: {
      configured: isMongoConfigured(),
      connected: db !== null,
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
