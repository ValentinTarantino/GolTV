import {
  inspectLiveFallback,
  inspectSportplusPage,
  inspectSportplusVariants,
  listLpfMatches,
  resolveLpfMatchStream,
} from "@/lib/lpf-matches";
import { isLpfStreamHost } from "@/lib/lpf-play";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Temporary diagnostics: shows what the deployment receives from the
 * provider when it looks for the playlist of a match.
 */
export async function GET(): Promise<Response> {
  const matches = await listLpfMatches();
  const live = matches.find((match) => match.status === "live") ?? matches[0];
  const demo = matches.find((match) => match.source === "demo");

  const [sportplus, stream, demoStream, fallback, variants] = await Promise.all([
    live?.source === "sportplus" ? inspectSportplusPage("220557", "8400999") : Promise.resolve(null),
    live ? resolveLpfMatchStream(live.id) : Promise.resolve(null),
    demo ? resolveLpfMatchStream(demo.id) : Promise.resolve(null),
    inspectLiveFallback(),
    live?.source === "sportplus" ? inspectSportplusVariants("220557", "8400999") : Promise.resolve(null),
  ]);

  let streamHostAllowed: boolean | null = null;
  if (stream?.kind === "hls") {
    try {
      streamHostAllowed = isLpfStreamHost(new URL(stream.src));
    } catch {
      streamHostAllowed = false;
    }
  }

  return Response.json(
    {
      matches: matches.length,
      live: live ? { home: live.home, away: live.away, status: live.status, source: live.source } : null,
      demo: demoStream ? { kind: demoStream.kind } : null,
      sportplus,
      stream: stream ? { kind: stream.kind, hostAllowed: streamHostAllowed } : null,
      fallback,
      variants,
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
