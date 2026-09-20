import { getApiFootballUsage } from "@/lib/api-football";
import { getFLUsage } from "@/lib/futbollibre";
import { getStreamUsage } from "@/lib/streaming";

export const revalidate = 0;

export async function GET() {
  return Response.json({
    timestamp: new Date().toISOString(),
    apis: {
      apiFootball: {
        description: "API-Football (api-sports.io)",
        keys: getApiFootballUsage(),
      },
      futbolLibre: {
        description: "FutbolLibre agenda + streams",
        ...getFLUsage(),
      },
      rapidApi: {
        description: "RapidAPI streaming (fallback)",
        ...getStreamUsage(),
      },
    },
  });
}
