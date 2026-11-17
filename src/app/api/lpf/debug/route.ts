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

/** Can this deployment reach the stream CDN at all? */
async function probeCdn(): Promise<Array<{ host: string; status: number | null; error?: string }>> {
  const hosts = ["jn317.sportvideodata.com", "sportvideodata.com"];
  return Promise.all(
    hosts.map(async (host) => {
      try {
        const res = await fetch(`https://${host}/`, {
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        });
        await res.arrayBuffer().catch(() => undefined);
        return { host, status: res.status };
      } catch (error) {
        return { host, status: null, error: String(error).slice(0, 100) };
      }
    })
  );
}

/** Fetches a playlist (and its first variant) to learn if the CDN serves this network. */
async function probePlaylist(raw: string): Promise<Record<string, unknown>> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "bad-url" };
  }
  if (url.protocol !== "https:" || !url.pathname.endsWith(".m3u8") || !isLpfStreamHost(url)) {
    return { error: "not-allowed", host: url.hostname };
  }
  const fetchOne = async (target: string) => {
    try {
      const res = await fetch(target, {
        headers: { "User-Agent": BROWSER_UA, Referer: `${SPORTPLUS_SITE_FOR_DEBUG}/football/` },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      const text = await res.text();
      return { status: res.status, length: text.length, body: text.slice(0, 4000) };
    } catch (error) {
      return { status: null, error: String(error).slice(0, 100) };
    }
  };
  const master = await fetchOne(url.toString());
  let variant: unknown = null;
  const masterBody = (master as { body?: string }).body ?? "";
  const variantLine = masterBody.split("\n").find((line) => line.trim() && !line.trim().startsWith("#"));
  if (variantLine && master.status === 200) {
    try {
      const variantUrl = new URL(variantLine.trim(), url).toString();
      variant = { url: new URL(variantUrl).hostname + new URL(variantUrl).pathname.slice(0, 40), ...(await fetchOne(variantUrl)) };
    } catch {
      variant = { error: "bad-variant" };
    }
  }
  return { host: url.hostname, master, variant };
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
const SPORTPLUS_SITE_FOR_DEBUG = "https://es.sportplus.watch";

/**
 * Temporary diagnostics: shows what the deployment receives from the
 * provider when it looks for the playlist of a match.
 */
export async function GET(request: Request): Promise<Response> {
  const playlistParam = new URL(request.url).searchParams.get("playlist");
  if (playlistParam) {
    return Response.json(await probePlaylist(playlistParam), { headers: { "Cache-Control": "no-store" } });
  }
  const matches = await listLpfMatches();
  const live = matches.find((match) => match.status === "live") ?? matches[0];
  const [sportplus, stream, fallback, variants, cdn] = await Promise.all([
    live?.source === "sportplus" ? inspectSportplusPage("220557", "8400999") : Promise.resolve(null),
    live ? resolveLpfMatchStream(live.id) : Promise.resolve(null),
    inspectLiveFallback(),
    live?.source === "sportplus" ? inspectSportplusVariants("220557", "8400999") : Promise.resolve(null),
    probeCdn(),
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
      sportplus,
      stream: stream ? { kind: stream.kind, hostAllowed: streamHostAllowed } : null,
      fallback,
      variants,
      cdn,
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
