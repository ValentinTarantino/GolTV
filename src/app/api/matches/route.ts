import { NextRequest } from "next/server";
import { fetchMatchesByDate } from "@/lib/api-football";
import { formatDateISO } from "@/lib/utils";

export const revalidate = 300; // Cache 5 minutes to avoid API rate limits

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get("date") ?? formatDateISO(new Date());

  const matches = await fetchMatchesByDate(date);

  return Response.json({ matches, date });
}
