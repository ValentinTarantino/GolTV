import { inspectSportplusPage, listLpfMatches } from "@/lib/lpf-matches";

export const dynamic = "force-dynamic";

/**
 * Temporary diagnostics: shows what the deployment receives from the
 * provider when it looks for the playlist of a match.
 */
export async function GET(): Promise<Response> {
  const matches = await listLpfMatches();
  const live = matches.find((match) => match.status === "live") ?? matches[0];

  const sportplus = live?.source === "sportplus" ? await inspectSportplusPage("220557", "8400999") : null;

  return Response.json(
    {
      matches: matches.length,
      live: live ? { home: live.home, away: live.away, status: live.status } : null,
      sportplus,
      env: {
        LPF_SOURCE_URL: Boolean(process.env.LPF_SOURCE_URL?.trim()),
        LPF_STREAM_HOSTS: Boolean(process.env.LPF_STREAM_HOSTS?.trim()),
        LPF_PROXY_SECRET: Boolean(process.env.LPF_PROXY_SECRET?.trim()),
        SPORTPLUS_API: Boolean(process.env.SPORTPLUS_API?.trim()),
        SPORTPLUS_SITE: Boolean(process.env.SPORTPLUS_SITE?.trim()),
        ANGULISMO_AGENDA_URL: Boolean(process.env.ANGULISMO_AGENDA_URL?.trim()),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
