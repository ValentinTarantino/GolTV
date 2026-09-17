import { fetchLeagues } from "@/lib/api-football";

export async function GET() {
  const leagues = fetchLeagues();
  return Response.json({ leagues });
}
