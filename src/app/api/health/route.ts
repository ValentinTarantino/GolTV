import { getApiFootballUsage } from "@/lib/api-football";
import { getPLUsage } from "@/lib/pelotalibre";
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
      pelotaLibre: {
        description: "Pelota Libre playback",
        ...getPLUsage(),
      },
      rapidApi: {
        description: "RapidAPI streaming (fallback)",
        ...getStreamUsage(),
      },
    },
  });
}
